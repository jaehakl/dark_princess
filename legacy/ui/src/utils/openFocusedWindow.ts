export function openFocusedWindow(to: string) {
  const openedWindow = window.open(to, '_blank');
  if (!openedWindow) {
    return;
  }

  openedWindow.opener = null;
  openedWindow.focus();
}
