// Platform quirks (Controls > Browser requirements).

/** True on a Mac, where Cmd + click stands in for every Ctrl + click and Ctrl + click is a right click. */
export const IS_MAC: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || navigator.userAgent;
  return /mac/i.test(platform);
})();

/** The key that does what the doc calls Ctrl in selection: Cmd on a Mac, Ctrl elsewhere. */
export const CTRL_NAME = IS_MAC ? 'Cmd' : 'Ctrl';
