// Service worker for extension messaging
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
  }
});
