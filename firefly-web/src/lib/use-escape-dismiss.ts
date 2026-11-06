"use client";

import { useEffect, useId, useRef } from "react";

export interface Dismissible {
  id: string;
  onDismiss: () => void;
}

export class EscapeStackManager {
  private stack: Dismissible[] = [];

  public register(id: string, onDismiss: () => void): () => void {
    this.stack = this.stack.filter((item) => item.id !== id);
    const item: Dismissible = { id, onDismiss };
    this.stack.push(item);
    return () => {
      this.unregister(id);
    };
  }

  public unregister(id: string) {
    this.stack = this.stack.filter((item) => item.id !== id);
  }

  public handleKeyDown(key: string): boolean {
    if (key !== "Escape" || this.stack.length === 0) {
      return false;
    }
    const top = this.stack.pop();
    if (top) {
      top.onDismiss();
      return true;
    }
    return false;
  }

  public getStackSize(): number {
    return this.stack.length;
  }

  public getTopId(): string | undefined {
    return this.stack[this.stack.length - 1]?.id;
  }

  public clear() {
    this.stack = [];
  }
}

export const globalEscapeStack = new EscapeStackManager();

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      const handled = globalEscapeStack.handleKeyDown("Escape");
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  });
}

export function useEscapeDismiss(
  enabled: boolean,
  onDismiss: () => void,
  explicitId?: string,
) {
  const autoId = useId();
  const id = explicitId ?? autoId;
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!enabled) return;
    return globalEscapeStack.register(id, () => {
      onDismissRef.current();
    });
  }, [enabled, id]);
}

export function registerDismissible(id: string, onDismiss: () => void): () => void {
  return globalEscapeStack.register(id, onDismiss);
}
