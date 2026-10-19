/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomMatchEntry {
  id: string;
  root: string;
  forms: string[];
  createdAt: number;
}

export interface BuiltinMatchEntry {
  root: string;
  forms: string[];
}

export interface FormMappingTarget {
  root: string;
  isCustom: boolean;
}
