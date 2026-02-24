/**
 * IME (Input Method Editor) composition utilities.
 *
 * When using CJK input methods, pressing Enter confirms the candidate word
 * rather than submitting the form. The browser signals this via:
 *   1. `KeyboardEvent.isComposing` (W3C standard)
 *   2. `KeyboardEvent.keyCode === 229` (legacy IME marker, covers older browsers & Safari edge cases)
 *
 * Use `isIMEComposing` as a single guard in every keydown handler that
 * triggers an action on Enter.
 */

/**
 * Returns `true` when the keyboard event originates from an active IME
 * composition session, meaning the user is still selecting a candidate and
 * the key press should NOT be treated as a real action (e.g. send message).
 */
export function isIMEComposing(
  e: React.KeyboardEvent | KeyboardEvent,
): boolean {
  // For React synthetic events, read from the underlying native event;
  // for plain DOM KeyboardEvent, read directly. keyCode 229 is the legacy
  // IME marker that covers older browsers and Safari edge cases.
  const nativeEvent = "nativeEvent" in e ? e.nativeEvent : e;
  return nativeEvent.isComposing || nativeEvent.keyCode === 229;
}
