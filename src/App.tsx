/// <reference types="chrome-types" />
import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function App() {
  const [input, setInput] = useState<string>("");
  const [status, setStatus] = useState<string>("Ready");
  const [isGeneratedAutoCollapseEnabled, setIsGeneratedAutoCollapseEnabled] =
    useState(false);

  useEffect(() => {
    void syncGeneratedAutoCollapseState();
  }, []);

  const collapse = async (filter: string[]) => {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      setStatus("No active tab found.");
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: ((filter: string[]) => {
        const regexList = filter.map((pattern) => new RegExp(pattern));
        const elements = [
          ...document.querySelectorAll("div.repos-summary-header"),
        ];

        const filteredElements = elements.filter((header) => {
          return [...header.querySelectorAll("span")].some((span) =>
            regexList.some((regex) => regex.test(span.textContent ?? "")),
          );
        });

        filteredElements.forEach((header) => {
          const collapseButton = header.querySelector<HTMLButtonElement>(
            "button.bolt-card-expand-button",
          );
          collapseButton?.click();
        });

        return filteredElements.length;
      }) as never,
      args: [filter],
    });

    setStatus(`Collapsed sections matching ${filter.join(", ")}.`);
  };

  const collapseGeneratedRows = async () => {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      setStatus("No active tab found.");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (() => {
        const generatedMatcher = /__generated__/i;
        const treeRoot = document.querySelector(
          "table.repos-changes-explorer-tree tbody",
        );

        if (!treeRoot) {
          return 0;
        }

        const hasGeneratedText = (row: HTMLTableRowElement) => {
          const rowText = row.textContent ?? "";
          return generatedMatcher.test(rowText);
        };

        let collapsedCount = 0;
        const clickedRowIds = new Set<string>();

        while (true) {
          const matchingRows = [
            ...treeRoot.querySelectorAll("tr[aria-expanded]"),
          ].filter((row): row is HTMLTableRowElement => {
            if (!(row instanceof HTMLTableRowElement)) {
              return false;
            }

            if (row.getAttribute("aria-expanded") !== "true") {
              return false;
            }

            if (!hasGeneratedText(row)) {
              return false;
            }

            return !clickedRowIds.has(row.id);
          });

          if (matchingRows.length === 0) {
            break;
          }

          matchingRows.forEach((row) => {
            const collapseControl = row.querySelector<HTMLElement>(
              ".bolt-tree-expand-button:not(.invisible)",
            );

            if (collapseControl) {
              collapseControl.dispatchEvent(
                new MouseEvent("click", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                }),
              );
              clickedRowIds.add(row.id);
              collapsedCount += 1;
            }
          });
        }

        return collapsedCount;
      }) as never,
    });

    const collapsedCount = results.reduce(
      (total, result) => total + (result.result ?? 0),
      0,
    );

    setStatus(
      collapsedCount > 0
        ? `Collapsed ${collapsedCount} generated row${collapsedCount === 1 ? "" : "s"}.`
        : "No matching rows found.",
    );
  };

  const syncGeneratedAutoCollapseState = async () => {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      setIsGeneratedAutoCollapseEnabled(false);
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (() => {
        type GeneratedAutoCollapseState = {
          cleanup: () => void;
          scheduleSweep: () => void;
          sweep: () => number;
        };

        const scope = window as Window & {
          __devopsGeneratedTreeAutoCollapse?: GeneratedAutoCollapseState;
        };

        return Boolean(scope.__devopsGeneratedTreeAutoCollapse);
      }) as never,
    });

    setIsGeneratedAutoCollapseEnabled(
      results.some((result) => Boolean(result.result)),
    );
  };

  const setGeneratedAutoCollapse = async (enabled: boolean) => {
    const tab = await getCurrentTab();

    if (!tab?.id) {
      setStatus("No active tab found.");
      setIsGeneratedAutoCollapseEnabled(false);
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: ((enabled: boolean) => {
        type GeneratedAutoCollapseState = {
          cleanup: () => void;
          scheduleSweep: () => void;
          sweep: () => number;
        };

        const scope = window as Window & {
          __devopsGeneratedTreeAutoCollapse?: GeneratedAutoCollapseState;
        };

        const existingState = scope.__devopsGeneratedTreeAutoCollapse;

        if (!enabled) {
          existingState?.cleanup();
          delete scope.__devopsGeneratedTreeAutoCollapse;
          return { enabled: false, collapsedCount: 0, available: true };
        }

        if (existingState) {
          return {
            enabled: true,
            collapsedCount: existingState.sweep(),
            available: true,
          };
        }

        const generatedMatcher = /__generated__/i;
        const treeBody = document.querySelector<HTMLTableSectionElement>(
          "table.repos-changes-explorer-tree tbody",
        );
        const scrollContainer =
          treeBody?.closest<HTMLElement>(".v-scroll-auto");

        if (!treeBody || !scrollContainer) {
          return { enabled: false, collapsedCount: 0, available: false };
        }

        let animationFrameId: number | null = null;

        const sweep = () => {
          let collapsedCount = 0;

          const matchingRows = [
            ...treeBody.querySelectorAll("tr[aria-expanded='true']"),
          ].filter((row): row is HTMLTableRowElement => {
            if (!(row instanceof HTMLTableRowElement)) {
              return false;
            }

            if (row.dataset.devopsCollapsePending === "true") {
              return false;
            }

            return generatedMatcher.test(row.textContent ?? "");
          });

          matchingRows.forEach((row) => {
            const collapseControl = row.querySelector<HTMLElement>(
              ".bolt-tree-expand-button:not(.invisible)",
            );

            if (!collapseControl) {
              return;
            }

            row.dataset.devopsCollapsePending = "true";
            collapseControl.dispatchEvent(
              new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
              }),
            );

            window.setTimeout(() => {
              delete row.dataset.devopsCollapsePending;
            }, 750);

            collapsedCount += 1;
          });

          return collapsedCount;
        };

        const scheduleSweep = () => {
          if (animationFrameId !== null) {
            return;
          }

          animationFrameId = window.requestAnimationFrame(() => {
            animationFrameId = null;
            sweep();
          });
        };

        const observer = new MutationObserver(() => {
          scheduleSweep();
        });

        observer.observe(treeBody, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["aria-expanded", "class", "style"],
        });

        scrollContainer.addEventListener("scroll", scheduleSweep, {
          passive: true,
        });

        scope.__devopsGeneratedTreeAutoCollapse = {
          cleanup: () => {
            observer.disconnect();
            scrollContainer.removeEventListener("scroll", scheduleSweep);

            if (animationFrameId !== null) {
              window.cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }
          },
          scheduleSweep,
          sweep,
        };

        return {
          enabled: true,
          collapsedCount: sweep(),
          available: true,
        };
      }) as never,
      args: [enabled],
    });

    const primaryResult =
      results.find((result) => result.frameId === 0)?.result ??
      results[0]?.result;

    if (!primaryResult?.available && enabled) {
      setStatus("Could not find the left file tree on this page.");
      setIsGeneratedAutoCollapseEnabled(false);
      return;
    }

    setIsGeneratedAutoCollapseEnabled(Boolean(primaryResult?.enabled));

    if (!enabled) {
      setStatus("Auto-collapse disabled.");
      return;
    }

    const collapsedCount = results.reduce(
      (total, result) => total + (result.result?.collapsedCount ?? 0),
      0,
    );

    setStatus(
      collapsedCount > 0
        ? `Auto-collapse enabled. Collapsed ${collapsedCount} generated folder${collapsedCount === 1 ? "" : "s"}.`
        : "Auto-collapse enabled. Generated folders will collapse as they render.",
    );
  };

  const quickFilters = [".graphql.ts", ".gql", ".ts", ".tsx", ".cs"];

  return (
    <div className="w-[28rem] space-y-4 rounded-lg border bg-background p-4 shadow-xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">DevOps refinement</h1>
        <p className="text-sm text-muted-foreground">
          Collapse noisy file groups and collapse tree rows that contain
          __generated__.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quick collapse filters</p>
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((value) => (
            <Button
              key={value}
              variant="outline"
              onClick={() => collapse([value])}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) {
            setStatus("Enter a filter before collapsing.");
            return;
          }

          void collapse([input.trim()]);
        }}
      >
        <Input
          placeholder="e.g., .graphql.ts"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
        />
        <Button type="submit">Collapse</Button>
      </form>

      <div className="rounded-md border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Collapse generated rows</p>
            <p className="text-xs text-muted-foreground">
              Collapses matching folder rows in the left file tree when their
              label contains __generated__. Auto mode keeps collapsing them as
              virtualized rows render.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void collapseGeneratedRows()}
            >
              Collapse now
            </Button>
            <Button
              variant={
                isGeneratedAutoCollapseEnabled ? "secondary" : "destructive"
              }
              onClick={() =>
                void setGeneratedAutoCollapse(!isGeneratedAutoCollapseEnabled)
              }
            >
              {isGeneratedAutoCollapseEnabled ? "Disable auto" : "Enable auto"}
            </Button>
          </div>
        </div>
      </div>

      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}

export default App;
