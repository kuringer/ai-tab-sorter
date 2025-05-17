// AI Tab Sorter - Background Script
let tabCreationTimesCache = {};
let tabOpenerInfoCache = {}; // Cache for openerTabId

// Function to load and initialize caches, and ensure all current tabs are covered
async function initializeAndLoadTabInfoCaches() {
  const localData = await chrome.storage.local.get(['tabCreationTimes', 'tabOpenerInfo']);
  tabCreationTimesCache = localData.tabCreationTimes || {};
  tabOpenerInfoCache = localData.tabOpenerInfo || {};
  console.log("Initialized tabCreationTimesCache from storage:", JSON.parse(JSON.stringify(tabCreationTimesCache)));
  console.log("Initialized tabOpenerInfoCache from storage:", JSON.parse(JSON.stringify(tabOpenerInfoCache)));

  const currentTabs = await chrome.tabs.query({});
  let creationCacheUpdated = false;
  let openerCacheUpdated = false;

  currentTabs.forEach(tab => {
    if (tab.id !== undefined && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      if (tabCreationTimesCache[tab.id] === undefined) {
        tabCreationTimesCache[tab.id] = Date.now();
        console.log(`Tab ${tab.id} (${tab.title || 'No Title'}) found without timestamp during init. Cached time: ${new Date(tabCreationTimesCache[tab.id]).toISOString()}`);
        creationCacheUpdated = true;
      }
      // Opener info is typically only available at creation, so we don't retroactively add it here
      // unless we have a way to reliably get it for existing tabs (which chrome.tabs.Tab doesn't always provide post-creation for all scenarios)
    }
  });

  const dataToSet = {};
  if (creationCacheUpdated) {
    dataToSet.tabCreationTimes = tabCreationTimesCache;
    console.log("Updated tabCreationTimes in storage during initialization.");
  }
  // No direct update for openerCache here as we primarily populate it on tab creation.
  // If we were to clean up stale entries, this would be a place.

  if (Object.keys(dataToSet).length > 0) {
    await chrome.storage.local.set(dataToSet);
  }
}

// Call initialization immediately when the script loads
initializeAndLoadTabInfoCaches().catch(err => console.error("Error during tab info caches initialization:", err));

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("AI Tab Sorter extension installed/updated. Reason:", details.reason);

  // Initialize default sync settings if they don't exist
  chrome.storage.sync.get(['apiKey', 'userPrompt', 'userGroups', 'sortingMode', 'yoloMode'], (syncResult) => {
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
    if (syncResult.yoloMode === undefined) {
      chrome.storage.sync.set({ yoloMode: false }); // Default YOLO mode to off
    }
  });
  // tabCreationTimesCache and tabOpenerInfoCache persistence are handled by initializeAndLoadTabInfoCaches and event listeners
});

// Listener for when a new tab is created
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined) return;

  const creationTime = Date.now();
  tabCreationTimesCache[tab.id] = creationTime;
  console.log(`Tab ${tab.id} created. Cached at ${new Date(creationTime).toISOString()}`);

  const dataToSet = { tabCreationTimes: tabCreationTimesCache };

  if (tab.openerTabId) {
    tabOpenerInfoCache[tab.id] = tab.openerTabId;
    console.log(`Tab ${tab.id} was opened by tab ${tab.openerTabId}. Cached opener info.`);
    dataToSet.tabOpenerInfo = tabOpenerInfoCache;
  }

  // Asynchronously save the updated caches to local storage for persistence
  chrome.storage.local.set(dataToSet, () => {
    if (chrome.runtime.lastError) {
      console.error("Error saving tab info to storage after tab creation:", chrome.runtime.lastError.message);
    }
  });

  // YOLO Mode: Auto-group new tab
  const settings = await new Promise(resolve => chrome.storage.sync.get(['yoloMode', 'apiKey'], resolve));
  
  console.log(`onCreated: Tab ID ${tab.id}, URL: ${tab.url}, Pending URL: ${tab.pendingUrl}, Title: "${tab.title || 'No Title'}"`);
  console.log(`onCreated: Settings check - yoloMode: ${settings.yoloMode}, apiKeySet: ${!!settings.apiKey}`);

  // It's possible the tab.url is not immediately available or is 'about:blank' initially.
  // We should only proceed if we have a valid http/https URL.
  // The 'tab.pendingUrl' might also be relevant if 'tab.url' is not yet set.
  const targetUrl = tab.url || tab.pendingUrl;
  const isHttpUrl = targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'));
  const isUngrouped = tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || tab.groupId === undefined;
  
  console.log(`onCreated: Target URL for YOLO check: ${targetUrl}, isHttpUrl: ${isHttpUrl}, isUngrouped: ${isUngrouped} (groupId: ${tab.groupId})`);

  if (settings.yoloMode && settings.apiKey && isHttpUrl && isUngrouped) {
    console.log(`YOLO Mode: Attempting to auto-group new tab ${tab.id} (${tab.title || 'No Title'}) with URL ${targetUrl} as it is ungrouped.`);
    try {
      // Pass the tab object that has the confirmed URL
      const tabForYolo = { ...tab, url: targetUrl };
      await handleYoloTabGrouping(tabForYolo, settings.apiKey);
    } catch (error) {
      console.error(`YOLO Mode: Error auto-grouping tab ${tab.id}:`, error.message, error.stack);
    }
  } else {
    let reason = [];
    if (!settings.yoloMode) reason.push("YOLO mode not enabled");
    if (!settings.apiKey) reason.push("API key not set");
    if (!isHttpUrl) reason.push(`URL "${targetUrl}" not http/https`);
    if (!isUngrouped) reason.push(`Tab already in group ${tab.groupId}`);
    
    if (reason.length > 0) {
      console.log(`YOLO Mode: Skipped for tab ${tab.id}. Reasons: ${reason.join('; ')}.`);
    } else {
      // This case should ideally not be hit if the main 'if' is false
      console.log(`YOLO Mode: Skipped for tab ${tab.id} for an unspecified reason within the conditional logic (this should not happen).`);
    }
  }
});

// Listener for when a tab is removed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  let cachesUpdated = false;
  const dataToSet = {};

  if (tabCreationTimesCache[tabId] !== undefined) {
    delete tabCreationTimesCache[tabId];
    dataToSet.tabCreationTimes = tabCreationTimesCache;
    console.log(`Removed creation time for tab ${tabId} from cache.`);
    cachesUpdated = true;
  }

  if (tabOpenerInfoCache[tabId] !== undefined) {
    delete tabOpenerInfoCache[tabId];
    dataToSet.tabOpenerInfo = tabOpenerInfoCache;
    console.log(`Removed opener info for tab ${tabId} from cache.`);
    cachesUpdated = true;
  }

  if (cachesUpdated) {
    // Asynchronously save the updated caches to local storage
    chrome.storage.local.set(dataToSet, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving tab info to storage after tab removal:", chrome.runtime.lastError.message);
      }
    });
  }
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
  // Use a snapshot of the in-memory caches directly
  const currentTabCreationTimesFromCache = { ...tabCreationTimesCache };
  const currentTabOpenerInfoFromCache = { ...tabOpenerInfoCache };

  const tabsWithInfo = tabs.map(tab => {
    const createdAt = currentTabCreationTimesFromCache[tab.id];
    const openerId = currentTabOpenerInfoFromCache[tab.id];
    const tabData = {
      title: tab.title,
      url: tab.url,
      id: tab.id,
    };
    if (createdAt) {
      tabData.openedAt = new Date(createdAt).toISOString();
    }
    if (openerId) {
      tabData.openedByTabId = openerId;
    }
    return tabData;
  });

  const promptData = {
    tabs: tabsWithInfo,
    userDefinedGroups: settings.userGroups, // [{name: "Work", description: "Tabs related to work projects"}, ...]
    userPrompt: settings.userPrompt,
    sortingMode: settings.sortingMode
  };

  // Construct the main prompt for OpenAI
  let mainPrompt = `${settings.userPrompt}\n\n`;
  mainPrompt += `Here are the currently open tabs. Each tab is listed with its unique ID, title, URL, optionally when it was opened (openedAt in ISO format), and optionally the ID of the tab that opened it (openedByTabId):\n`;
  promptData.tabs.forEach(tab => {
    let tabInfo = `Tab ID: ${tab.id}, Title: "${tab.title}", URL: ${tab.url}`;
    if (tab.openedAt) {
      tabInfo += `, Opened At: ${tab.openedAt}`;
    }
    if (tab.openedByTabId) {
      tabInfo += `, Opened By Tab ID: ${tab.openedByTabId}`;
    }
    mainPrompt += tabInfo + `\n`;
  });
  mainPrompt += `\nConsider the 'Opened At' timestamp to potentially group tabs by session or recency.`;
  mainPrompt += ` Also, consider the 'Opened By Tab ID' to identify related tabs; tabs opened by the same tab or forming a chain of openings might belong together.\n`;

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

async function handleYoloTabGrouping(newTab, apiKey) {
  console.log(`YOLO: Processing tab ${newTab.id} - ${newTab.url}`);

  // Ensure newTab.url is valid before proceeding
  if (!newTab.url || !(newTab.url.startsWith('http://') || newTab.url.startsWith('https://'))) {
    console.warn(`YOLO: New tab ${newTab.id} does not have a valid http/https URL ("${newTab.url}"). Skipping YOLO grouping.`);
    return;
  }

  // 1. Get all other relevant open tabs for context AND existing groups
  const [allTabs, existingChromeGroups] = await Promise.all([
    new Promise(resolve => {
      chrome.tabs.query({ pinned: false, url: ["http://*/*", "https://*/*"] }, tabs => {
        resolve(tabs.filter(t => t.id !== newTab.id && t.url && !t.url.startsWith('chrome-extension://')));
      });
    }),
    chrome.tabGroups.query({})
  ]);

  const existingGroupNames = existingChromeGroups.map(g => g.title).filter(title => title); // Filter out empty titles
  console.log("YOLO: Existing group names:", existingGroupNames);

  // If no other tabs for context, attempt to group by domain or a generic name (no AI call needed here)
  if (allTabs.length === 0) {
    console.log(`YOLO: No other context tabs for new tab ${newTab.id}. Attempting to group by domain.`);
    try {
        const parsedUrl = new URL(newTab.url);
        const domain = parsedUrl.hostname.startsWith('www.') ? parsedUrl.hostname.substring(4) : parsedUrl.hostname;
        let groupName = domain || "New Tab"; // Fallback group name

        // Check if this domain group already exists (case-insensitive check for robustness)
        const existingDomainGroup = existingChromeGroups.find(g => g.title && g.title.toLowerCase() === groupName.toLowerCase());
        if (existingDomainGroup) {
            console.log(`YOLO: Domain group "${groupName}" (ID: ${existingDomainGroup.id}) already exists. Adding tab to it.`);
            await chrome.tabs.group({ tabIds: [newTab.id], groupId: existingDomainGroup.id });
        } else {
            console.log(`YOLO: No context tabs, creating new group "${groupName}" for tab ${newTab.id} (${newTab.title || 'No Title'})`);
            await applyTabGrouping({ [groupName]: [newTab.id] });
        }
    } catch (e) {
        console.warn(`YOLO: Could not parse URL ("${newTab.url}") for new tab ${newTab.id} to create/use domain-based group. Error: ${e.message}. Skipping.`);
    }
    return; // Exit after attempting domain grouping
  }

  // Prepare tab info for the prompt
  const existingTabsInfo = allTabs.map(t => ({
    id: t.id,
    title: t.title,
    url: t.url,
    groupId: t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? t.groupId : undefined, // Include groupId if tab is grouped
    // We could also map groupId to groupName here if we want to pass group names of existing tabs
  }));

  const newTabInfo = {
    id: newTab.id,
    title: newTab.title || "", // Ensure title is a string
    url: newTab.url,
    openedByTabId: tabOpenerInfoCache[newTab.id]
  };

  // 2. Construct the prompt for OpenAI
  let yoloPrompt = `A new browser tab has just been opened. Your task is to suggest a suitable group name for this new tab.
Consider its content (title, URL), how it might relate to other currently open tabs, and whether it fits into an *existing group*.

The new tab is:
- ID: ${newTabInfo.id}
- Title: "${newTabInfo.title}"
- URL: ${newTabInfo.url}`;
  if (newTabInfo.openedByTabId) {
    yoloPrompt += `\n- This tab was opened by Tab ID: ${newTabInfo.openedByTabId}`;
  }

  yoloPrompt += `\n\nHere are the other currently open tabs (for context):\n`;
  existingTabsInfo.forEach(t => {
    let tabContext = `- Tab ID: ${t.id}, Title: "${t.title || ""}", URL: ${t.url}`;
    if (t.groupId) {
      const group = existingChromeGroups.find(g => g.id === t.groupId);
      if (group && group.title) {
        tabContext += `, Currently in group: "${group.title}" (ID: ${t.groupId})`;
      }
    }
    yoloPrompt += tabContext + `\n`;
  });

  if (existingGroupNames.length > 0) {
    yoloPrompt += `\nHere is a list of *EXISTING group names* you should prioritize if the new tab fits well into one of them:\n`;
    existingGroupNames.forEach(name => {
      yoloPrompt += `- "${name}"\n`;
    });
    yoloPrompt += `If the new tab clearly belongs to one of these existing groups, please use that exact group name. Otherwise, suggest a new, concise, and relevant group name.\n`;
  } else {
    yoloPrompt += `\nNo groups currently exist. Suggest a new, concise, and relevant group name for this tab.\n`;
  }

  yoloPrompt += `\nYour response MUST be a JSON object with a single key "groupName", and its value should be the suggested group name string (either an existing one or a new one). For example:
{
  "groupName": "Suggested or Existing Group Name"
}
`;

  console.log("YOLO Mode - Constructed Prompt for OpenAI:", yoloPrompt);

  // 3. Call OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: yoloPrompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: "Unknown error and failed to parse error response." } }));
    console.error("YOLO Mode - OpenAI API error:", errorData);
    throw new Error(`OpenAI API error for YOLO mode: ${errorData.error?.message || response.statusText}`);
  }

  const result = await response.json();
  const assistantResponse = result.choices[0]?.message?.content;

  if (!assistantResponse) {
    console.error("YOLO Mode - No content in OpenAI response:", result);
    throw new Error("OpenAI returned an empty response for YOLO mode.");
  }
  console.log("YOLO Mode - Actual OpenAI Response:", assistantResponse);

  let suggestedGroupResponse;
  try {
    suggestedGroupResponse = JSON.parse(assistantResponse);
  } catch (e) {
    console.error("YOLO Mode - Failed to parse AI response:", e);
    throw new Error("AI returned an invalid response format for YOLO mode.");
  }

  if (!suggestedGroupResponse || typeof suggestedGroupResponse.groupName !== 'string' || suggestedGroupResponse.groupName.trim() === "") {
    console.error("YOLO Mode - Invalid group name from AI:", suggestedGroupResponse);
    throw new Error("AI did not provide a valid group name for YOLO mode.");
  }

  const suggestedGroupName = suggestedGroupResponse.groupName.trim();
  console.log(`YOLO Mode: AI suggested group name "${suggestedGroupName}" for tab ${newTab.id}`);

  // 4. Apply the grouping - Check if AI suggested an existing group name (case-insensitive)
  const matchedExistingGroup = existingChromeGroups.find(g => g.title && g.title.toLowerCase() === suggestedGroupName.toLowerCase());

  if (matchedExistingGroup) {
    console.log(`YOLO Mode: AI suggested an existing group: "${matchedExistingGroup.title}" (ID: ${matchedExistingGroup.id}). Adding tab to this group.`);
    try {
      await chrome.tabs.group({ tabIds: [newTab.id], groupId: matchedExistingGroup.id });
      console.log(`YOLO Mode: Tab ${newTab.id} added to existing group "${matchedExistingGroup.title}".`);
    } catch (error) {
      console.error(`YOLO Mode: Error adding tab ${newTab.id} to existing group ${matchedExistingGroup.id}:`, error);
      // Fallback: create a new group with the suggested name if adding to existing fails for some reason
      console.log(`YOLO Mode: Fallback - creating new group "${suggestedGroupName}" for tab ${newTab.id}.`);
      await applyTabGrouping({ [suggestedGroupName]: [newTab.id] });
    }
  } else {
    console.log(`YOLO Mode: AI suggested a new group name: "${suggestedGroupName}". Creating new group.`);
    await applyTabGrouping({ [suggestedGroupName]: [newTab.id] });
    console.log(`YOLO Mode: Tab ${newTab.id} grouped into new group "${suggestedGroupName}".`);
  }
}