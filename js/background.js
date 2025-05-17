// AI Tab Sorter - Background Script

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("AI Tab Sorter extension installed/updated.");
  // Initialize default settings if they don't exist
  chrome.storage.sync.get(['apiKey', 'userPrompt', 'userGroups', 'sortingMode'], (result) => {
    if (result.apiKey === undefined) {
      chrome.storage.sync.set({ apiKey: '' });
    }
    if (result.userPrompt === undefined) {
      chrome.storage.sync.set({ userPrompt: 'Organize these browser tabs into logical groups based on their content and purpose.' });
    }
    if (result.userGroups === undefined) {
      chrome.storage.sync.set({ userGroups: [] });
    }
    if (result.sortingMode === undefined) {
      chrome.storage.sync.set({ sortingMode: 'respect' }); // 'respect' or 'autonomous'
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
      .then(result => sendResponse({ success: true, message: "Tabs sorted (simulated).", data: result }))
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
  const promptData = {
    tabs: tabs.map(tab => ({ title: tab.title, url: tab.url, id: tab.id })),
    userDefinedGroups: settings.userGroups, // [{name: "Work", description: "Tabs related to work projects"}, ...]
    userPrompt: settings.userPrompt,
    sortingMode: settings.sortingMode
  };

  // Construct the main prompt for OpenAI
  let mainPrompt = `${settings.userPrompt}\n\n`;
  mainPrompt += `Here are the currently open tabs:\n`;
  promptData.tabs.forEach((tab, index) => {
    mainPrompt += `${index + 1}. Title: "${tab.title}", URL: ${tab.url}\n`;
  });
  mainPrompt += `\n`;

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

  mainPrompt += `\nYour response should be a JSON object. The top-level keys should be the group names. Each group name should map to an array of tab IDs (integers) that belong to that group. For example:
{
  "Research": [101, 102, 105],
  "Social Media": [103],
  "News": [104, 106]
}
Ensure all provided tab IDs are assigned to a group. If a tab doesn't fit well into any other group, create a new group for it or place it in a general 'Miscellaneous' group.
Only include tab IDs that were provided in the input.
`;

  console.log("Constructed Prompt for OpenAI:", mainPrompt);

  // 4. Call OpenAI API (Simulated for now)
  // In a real scenario, you would use fetch to call the OpenAI API
  // const apiKey = settings.apiKey;
  // const response = await fetch('https://api.openai.com/v1/chat/completions', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${apiKey}`
  //   },
  //   body: JSON.stringify({
  //     model: 'gpt-4o', // Or the model chosen by the user
  //     messages: [{ role: 'user', content: mainPrompt }],
  //     response_format: { type: "json_object" }
  //   })
  // });

  // if (!response.ok) {
  //   const errorData = await response.json();
  //   console.error("OpenAI API error:", errorData);
  //   throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  // }

  // const result = await response.json();
  // const assistantResponse = result.choices[0]?.message?.content;

  // Simulated response for now:
  const simulatedAssistantResponse = JSON.stringify({
    "Project Alpha": promptData.tabs.length > 0 ? [promptData.tabs[0].id] : [],
    "General Browsing": promptData.tabs.length > 1 ? promptData.tabs.slice(1).map(t => t.id) : []
  });
  console.log("Simulated OpenAI Response:", simulatedAssistantResponse);

  let groupedTabs;
  try {
    groupedTabs = JSON.parse(simulatedAssistantResponse);
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    throw new Error("AI returned an invalid response format.");
  }

  // 5. Process response and group tabs
  console.log("Parsed grouped tabs:", groupedTabs);
  await applyTabGrouping(groupedTabs);

  return { message: "Tabs have been sorted and grouped (simulated)." };
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