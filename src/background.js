// Service worker for OAuth2 and Calendar API
console.log('GCal Time Tracker Helper: service worker loaded');

function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

async function fetchWithAuth(url, options = {}) {
  let token = await getAuthToken();
  let response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  // If 401, clear cached token and retry once
  if (response.status === 401) {
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
    token = await getAuthToken();
    response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  }
  return response;
}

async function listCalendars() {
  const response = await fetchWithAuth(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList'
  );
  if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
  const data = await response.json();
  return data.items.filter(cal => cal.accessRole === 'owner' || cal.accessRole === 'writer');
}

async function createEvent({ calendarId, summary, startTime, endTime }) {
  const response = await fetchWithAuth(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      }),
    }
  );
  if (!response.ok) throw new Error(`Create event error: ${response.status}`);
  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LIST_CALENDARS') {
    listCalendars().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // async response
  }
  if (message.type === 'CREATE_EVENT') {
    createEvent(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
  }
});
