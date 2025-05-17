// AI Tab Sorter - Background Script

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Tab Sorter extension installed/updated.");
  // Initialize default settings if they don't exist
  chrome.storage.sync.get(['apiKey', 'userPrompt', 'userGroups', 'sortingMode'], (syncResult) => {
    if (syncResult.apiKey === undefined) {
      chrome.storage.sync.set({ apiKey: '' });
    }
    if (syncResult.userPrompt === undefined) {
      chrome.storage.sync.set({ userPrompt: 'Organize these browser tabs into logical groups based on their content and purpose.' });
    }
    if (syncResult.userGroups === undefined) {
      chrome.storage.sync.set({ userGroups: [] });
    }
    if (syncResult.sortingMode === undefined) {
      chrome.storage.sync.set({ sortingMode: 'respect' }); // 'respect' or 'autonomous'
    }
  });
  // Initialize tabCreationTimes in local storage
  chrome.storage.local.get(['tabCreationTimes'], (localResult) => {
    if (localResult.tabCreationTimes === undefined) {
      chrome.storage.local.set({ tabCreationTimes: {} });
      console.log("Initialized tabCreationTimes in local storage.");
    }
  });
});

// Listener for when a new tab is created
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined) {
    chrome.storage.local.get(['tabCreationTimes'], (result) => {
      const tabCreationTimes = result.tabCreationTimes || {};
      tabCreationTimes[tab.id] = Date.now();
      chrome.storage.local.set({ tabCreationTimes }, () => {
        console.log(`Tab ${tab.id} created at ${new Date(tabCreationTimes[tab.id]).toISOString()}`);
      });
    });
  }
});

// Listener for when a tab is removed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.storage.local.get(['tabCreationTimes'], (result) => {
    const tabCreationTimes = result.tabCreationTimes || {};
    if (tabCreationTimes[tabId] !== undefined) {
      delete tabCreationTimes[tabId];
      chrome.storage.local.set({ tabCreationTimes }, () => {
        console.log(`Removed creation time for tab ${tabId}.`);
      });
    }
  });
});

// Listener for messages from popup or options page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sortTabs") {
    console.log("Received sortTabs request", request.data);
    // Placeholder for actual sorting logic
    // 1. Get all open tabs
    // 2. Get settings (API key, user prompt, user groups, sorting mode)
    // 3. Prepare data for OpenAI API
    // 4. Call OpenAI API
    // 5. Process response and group tabs
    // This will be implemented in later steps
    performTabSorting()
      .then(result => sendResponse({ success: true, message: "Tabs sorted successfully!", data: result }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true; // Indicates that the response will be sent asynchronously
  } else if (request.action === "groupTabsByDomain") {
    console.log("Received groupTabsByDomain request", request.data);
    performDomainGrouping()
      .then(result => sendResponse({ success: true, message: "Tabs grouped by domain!", data: result }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true; // Indicates that the response will be sent asynchronously
  } else if (request.action === "ungroupAllTabs") {
    console.log("Received ungroupAllTabs request", request.data);
    performUngroupAll()
      .then(result => sendResponse({ success: true, message: "All tabs ungrouped!", data: result }))
      .catch(error => sendResponse({ success: false, message: error.message }));
    return true; // Indicates that the response will be sent asynchronously
  }
  // Add other message handlers if needed
});

async function performTabSorting() {
  console.log("Starting tab sorting process...");

  // 1. Get settings from chrome.storage
  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey', 'userPrompt', 'userGroups', 'sortingMode'], resolve);
  });

  if (!settings.apiKey) {
    console.error("OpenAI API Key is not set.");
    throw new Error("OpenAI API Key is not set. Please set it in the options page.");
  }

  // 2. Get all open tabs (excluding pinned tabs and the extension's own pages)
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ pinned: false, url: ["http://*/*", "https://*/*"] }, (tabs) => {
      // Filter out extension's own pages if necessary, though query should handle most
      resolve(tabs.filter(tab => !tab.url.startsWith('chrome-extension://')));
    });
  });

  if (tabs.length === 0) {
    console.log("No tabs to sort.");
    return { message: "No tabs to sort." };
  }

  console.log("Tabs to sort:", tabs.map(t => ({ title: t.title, url: t.url })));
  console.log("Settings:", settings);

  // 3. Prepare data for OpenAI API
  const tabCreationTimes = await new Promise((resolve) => {
    chrome.storage.local.get(['tabCreationTimes'], (result) => resolve(result.tabCreationTimes || {}));
  });

  const tabsWithCreationTime = tabs.map(tab => {
    const createdAt = tabCreationTimes[tab.id];
    return {
      title: tab.title,
      url: tab.url,
      id: tab.id,
      // Add a human-readable creation time if available
      ...(createdAt && { openedAt: new Date(createdAt).toISOString() })
    };
  });

  const promptData = {
    tabs: tabsWithCreationTime,
    userDefinedGroups: settings.userGroups, // [{name: "Work", description: "Tabs related to work projects"}, ...]
    userPrompt: settings.userPrompt,
    sortingMode: settings.sortingMode
  };

  // Construct the main prompt for OpenAI
  let mainPrompt = `${settings.userPrompt}\n\n`;
  mainPrompt += `Here are the currently open tabs. Each tab is listed with its unique ID, title, URL, and optionally when it was opened (openedAt in ISO format):\n`;
  promptData.tabs.forEach(tab => {
    let tabInfo = `Tab ID: ${tab.id}, Title: "${tab.title}", URL: ${tab.url}`;
    if (tab.openedAt) {
      tabInfo += `, Opened At: ${tab.openedAt}`;
    }
    mainPrompt += tabInfo + `\n`;
  });
  mainPrompt += `\nConsider the 'Opened At' timestamp to potentially group tabs by session or recency if it seems relevant to the user's prompt or the tab content.\n`;

  if (settings.sortingMode === 'respect' && settings.userGroups && settings.userGroups.length > 0) {
    mainPrompt += `Please try to assign tabs to the following user-defined groups based on their descriptions. For tabs that don't fit, create new logical groups.\n`;
    settings.userGroups.forEach(group => {
      mainPrompt += `- Group Name: "${group.name}", Description: "${group.description}"\n`;
    });
  } else if (settings.sortingMode === 'autonomous') {
    mainPrompt += `Please autonomously create logical groups for these tabs.\n`;
  } else {
     mainPrompt += `Please create logical groups for these tabs. If user-defined groups were provided and the mode is 'respect', prioritize them.\n`;
  }

  mainPrompt += `\nYour response should be a JSON object. The top-level keys should be the group names. Each group name should map to an array of the actual tab IDs (integers, e.g., 123, 456) that belong to that group. Use the Tab IDs provided above. For example:
{
  "Research Projects": [1723, 1724, 1728],
  "Social Media Updates": [1725],
  "News Articles": [1726, 1729]
}
Ensure all provided tab IDs are assigned to a group. If a tab doesn't fit well into any other group, create a new group for it or place it in a general 'Miscellaneous' group.
Only include the actual tab IDs that were provided in the input list of tabs. Do not use sequential numbers like 1, 2, 3 unless those are the actual tab IDs.
`;

  console.log("Constructed Prompt for OpenAI:", mainPrompt);

  // 4. Call OpenAI API (Simulated for now)
  // In a real scenario, you would use fetch to call the OpenAI API
  const apiKey = settings.apiKey;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o', // Or the model chosen by the user
      messages: [{ role: 'user', content: mainPrompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: "Unknown error and failed to parse error response." } }));
    console.error("OpenAI API error:", errorData);
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }

  const result = await response.json();
  const assistantResponse = result.choices[0]?.message?.content;

  if (!assistantResponse) {
    console.error("No content in OpenAI response:", result);
    throw new Error("OpenAI returned an empty response.");
  }
  console.log("Actual OpenAI Response:", assistantResponse);

  let groupedTabs;
  try {
    groupedTabs = JSON.parse(assistantResponse);
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    throw new Error("AI returned an invalid response format.");
  }

  // 5. Process response and group tabs
  console.log("Parsed grouped tabs:", groupedTabs);
  await applyTabGrouping(groupedTabs);

  return { message: "Tabs have been sorted and grouped." };
}

async function applyTabGrouping(groupedTabs) {
  const groupObjects = {}; // To store Chrome group IDs

  for (const groupName in groupedTabs) {
    const tabIdsInGroup = groupedTabs[groupName];
    if (tabIdsInGroup && tabIdsInGroup.length > 0) {
      try {
        // Check if a group with this name already exists (less reliable by title)
        // It's better to create new groups and let Chrome handle duplicates or manage them if needed.
        // For simplicity, we'll create new groups. If you want to reuse, you'd query existing groups.

        const newGroup = await chrome.tabs.group({ tabIds: tabIdsInGroup });
        await chrome.tabGroups.update(newGroup, { title: groupName });
        groupObjects[groupName] = newGroup;
        console.log(`Group "${groupName}" created with ID ${newGroup} for tabs ${tabIdsInGroup.join(', ')}`);
      } catch (error) {
        console.error(`Error creating or updating group "${groupName}" for tabs ${tabIdsInGroup.join(', ')}:`, error);
        // Attempt to group tabs individually if batching fails for some reason
        // This is a fallback, ideally the initial grouping should work.
        for (const tabId of tabIdsInGroup) {
          try {
            const individualGroup = await chrome.tabs.group({ tabIds: [tabId] });
            await chrome.tabGroups.update(individualGroup, { title: groupName });
            console.log(`Individually grouped tab ${tabId} into "${groupName}" with ID ${individualGroup}`);
          } catch (individualError) {
            console.error(`Error individually grouping tab ${tabId} into "${groupName}":`, individualError);
          }
        }
      }
    }
  }
  console.log("Tab grouping applied:", groupObjects);
}

// Example of how to get current tab (not used in sorting all tabs)
// chrome.tabs.getCurrent(tab => {
//   console.log("Current tab (within background script context, if any):", tab);
// });

async function performDomainGrouping() {
  console.log("Starting tab grouping by domain...");

  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ pinned: false, url: ["http://*/*", "https://*/*"] }, (tabs) => {
      resolve(tabs.filter(tab => !tab.url.startsWith('chrome-extension://')));
    });
  });

  if (tabs.length === 0) {
    console.log("No tabs to group by domain.");
    return { message: "No tabs to group." };
  }

  const tabsByDomain = {};
  for (const tab of tabs) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.startsWith('www.') ? url.hostname.substring(4) : url.hostname;
      if (!tabsByDomain[domain]) {
        tabsByDomain[domain] = [];
      }
      tabsByDomain[domain].push(tab.id);
    } catch (e) {
      console.warn(`Could not parse URL or get hostname for tab ID ${tab.id} (${tab.url}):`, e);
      // Optionally, group unparsable URLs under a special group name
      const unknownDomain = "Uncategorized (URL error)";
      if (!tabsByDomain[unknownDomain]) {
        tabsByDomain[unknownDomain] = [];
      }
      tabsByDomain[unknownDomain].push(tab.id);
    }
  }

  console.log("Tabs grouped by domain (before applying):", tabsByDomain);
  await applyTabGrouping(tabsByDomain); // Reusing the existing applyTabGrouping function

  return { message: "Tabs have been grouped by domain." };
}

async function performUngroupAll() {
  console.log("Starting ungrouping all tabs...");

  const tabs = await new Promise((resolve) => {
    // Query for all tabs, regardless of whether they are in a group or not,
    // as chrome.tabs.ungroup() takes an array of tab IDs.
    chrome.tabs.query({}, resolve);
  });

  if (tabs.length === 0) {
    console.log("No tabs to ungroup.");
    return { message: "No tabs found to ungroup." };
  }

  const groupedTabIds = tabs
    .filter(tab => tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && tab.groupId !== undefined)
    .map(tab => tab.id);

  if (groupedTabIds.length === 0) {
    console.log("No grouped tabs found to ungroup.");
    return { message: "No currently grouped tabs found." };
  }

  try {
    await chrome.tabs.ungroup(groupedTabIds);
    console.log(`Successfully ungrouped ${groupedTabIds.length} tabs:`, groupedTabIds);
    return { message: `Successfully ungrouped ${groupedTabIds.length} tabs.` };
  } catch (error) {
    console.error("Error ungrouping tabs:", error);
    throw new Error(`Failed to ungroup tabs: ${error.message}`);
  }
}