/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeckTreeNode, PoolNote } from '../types/pool';

/**
 * Determine default disabled status for a deck path when first encountered.
 * Decks under the English root deck start enabled by default.
 * Decks outside the English root deck start disabled / not saved.
 */
export function isDeckDisabledByDefault(deckPath: string, rootDeck?: string | null): boolean {
  // Outside root deck -> closed / not saved
  if (rootDeck && deckPath !== rootDeck && !deckPath.startsWith(`${rootDeck}::`)) {
    return true;
  }
  if (!rootDeck && !deckPath.startsWith('**İngilizce kelimeler')) {
    return true;
  }

  // Under English root deck -> starts enabled by default
  return false;
}

/**
 * Checks if a deck or any of its ancestor parent decks is in the disabledDecks set
 */
export function isDeckOrAncestorDisabled(deckPath: string, disabledDecksSet: Set<string>): boolean {
  if (!deckPath) return false;
  if (disabledDecksSet.has(deckPath)) return true;
  const parts = deckPath.split('::');
  let current = '';
  for (let i = 0; i < parts.length; i++) {
    current = current ? `${current}::${parts[i]}` : parts[i];
    if (disabledDecksSet.has(current)) return true;
  }
  return false;
}

/**
 * Build hierarchical DeckTreeNode tree from notes or deck counts map
 */
export function buildDeckTree(
  notesOrCounts: PoolNote[] | Map<string, number> | Array<{ path: string; noteCount: number }>,
  newDecksSet: Set<string> = new Set(),
  rootDeck?: string | null
): DeckTreeNode[] {
  // Count notes per deck path
  const deckCounts = new Map<string, number>();
  if (Array.isArray(notesOrCounts)) {
    for (const item of notesOrCounts) {
      if ('guid' in item) {
        deckCounts.set(item.deck, (deckCounts.get(item.deck) || 0) + 1);
      } else {
        deckCounts.set(item.path, item.noteCount);
      }
    }
  } else if (notesOrCounts instanceof Map) {
    for (const [k, v] of notesOrCounts.entries()) {
      deckCounts.set(k, v);
    }
  }

  interface TempNode {
    name: string;
    path: string;
    isNew: boolean;
    isOutsideRoot: boolean;
    children: Map<string, TempNode>;
    directCount: number;
  }

  const rootNodes = new Map<string, TempNode>();

  for (const [fullPath, count] of deckCounts.entries()) {
    const parts = fullPath.split('::').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;

    let currentMap = rootNodes;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}::${part}` : part;
      const isLeaf = i === parts.length - 1;

      if (!currentMap.has(part)) {
        const isOutside = rootDeck
          ? (accumulatedPath !== rootDeck && !accumulatedPath.startsWith(`${rootDeck}::`))
          : (!accumulatedPath.startsWith('**İngilizce kelimeler'));

        const isNew = newDecksSet.has(accumulatedPath);

        currentMap.set(part, {
          name: part,
          path: accumulatedPath,
          isNew,
          isOutsideRoot: Boolean(isOutside),
          children: new Map(),
          directCount: 0,
        });
      }

      const node = currentMap.get(part)!;
      if (isLeaf) {
        node.directCount += count;
      }
      currentMap = node.children;
    }
  }

  function convertTempNode(node: TempNode): DeckTreeNode {
    const children = Array.from(node.children.values())
      .map(convertTempNode)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    const childSum = children.reduce((sum, c) => sum + c.noteCount, 0);
    const totalCount = node.directCount + childSum;

    return {
      name: node.name,
      path: node.path,
      noteCount: totalCount,
      isNew: node.isNew,
      isOutsideRoot: node.isOutsideRoot,
      children,
    };
  }

  const primaryRoot = rootDeck || '**İngilizce kelimeler';

  return Array.from(rootNodes.values())
    .map(convertTempNode)
    .sort((a, b) => {
      // Prioritize chosen root deck at the top
      const aIsRoot = a.path === primaryRoot || a.path.startsWith(`${primaryRoot}::`);
      const bIsRoot = b.path === primaryRoot || b.path.startsWith(`${primaryRoot}::`);
      if (aIsRoot && !bIsRoot) return -1;
      if (!aIsRoot && bIsRoot) return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
}

/**
 * Returns all distinct deck paths represented by this node and all its descendants
 */
export function getAllPathsInSubtree(node: DeckTreeNode): string[] {
  const paths = [node.path];
  for (const child of node.children) {
    paths.push(...getAllPathsInSubtree(child));
  }
  return paths;
}

/**
 * Calculate checkbox status for a deck tree node:
 * - 'checked': all paths in subtree are enabled
 * - 'unchecked': all paths in subtree are disabled
 * - 'indeterminate': mixed
 */
export function getNodeCheckState(
  node: DeckTreeNode,
  disabledDecksSet: Set<string>
): 'checked' | 'unchecked' | 'indeterminate' {
  const allSubPaths = getAllPathsInSubtree(node);
  let hasEnabled = false;
  let hasDisabled = false;

  for (const p of allSubPaths) {
    if (disabledDecksSet.has(p)) {
      hasDisabled = true;
    } else {
      hasEnabled = true;
    }
    if (hasEnabled && hasDisabled) {
      return 'indeterminate';
    }
  }

  if (hasEnabled && !hasDisabled) return 'checked';
  if (!hasEnabled && hasDisabled) return 'unchecked';
  return 'unchecked';
}

/**
 * Toggle a node:
 * If currently 'checked' -> toggle off: add all descendant paths to disabledDecks
 * If currently 'unchecked' or 'indeterminate' -> toggle on: remove all descendant paths from disabledDecks
 */
export function toggleNodeDecks(
  node: DeckTreeNode,
  currentDisabled: string[]
): string[] {
  const disabledSet = new Set(currentDisabled);
  const subPaths = getAllPathsInSubtree(node);
  const currentState = getNodeCheckState(node, disabledSet);

  if (currentState === 'checked') {
    // Turn off all
    for (const p of subPaths) {
      disabledSet.add(p);
    }
  } else {
    // Turn on all
    for (const p of subPaths) {
      disabledSet.delete(p);
    }
  }

  return Array.from(disabledSet);
}
