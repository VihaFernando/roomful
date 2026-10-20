/**
 * Normalizes free text for comparisons (word guesses, "clue contains the word"):
 * lowercase, strip accents and punctuation, collapse whitespace.
 */
export function normalizeForCompare(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Single-line, trimmed, invisible characters removed. */
export function sanitizeLine(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
