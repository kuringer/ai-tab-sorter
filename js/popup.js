// AI Tab Sorter - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const aiSortButton = document.getElementById('aiSortButton');
  const domainSortButton = document.getElementById('domainSortButton');
  const ungroupAllButton = document.getElementById('ungroupAllButton');
  const statusMessage = document.getElementById('statusMessage');

  function handleSortAction(button, action, loadingMessage) {
    if (!button) {
      console.error(`Button for action "${action}" not found.`);
      if (statusMessage) statusMessage.textContent = "Error: UI element missing.";
      return;
    }

    button.addEventListener('click', () => {
      statusMessage.textContent = loadingMessage;
      aiSortButton.disabled = true;
      domainSortButton.disabled = true;
      if (ungroupAllButton) ungroupAllButton.disabled = true;

      chrome.runtime.sendMessage({ action: action, data: {} }, (response) => {
        if (chrome.runtime.lastError) {
          statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
          console.error("Error sending message to background script:", chrome.runtime.lastError);
        } else if (response && response.success) {
          statusMessage.textContent = response.message || 'Action completed successfully!';
          console.log("Response from background:", response);
          // setTimeout(() => window.close(), 2000); // Optionally close popup
        } else if (response) {
          statusMessage.textContent = `Error: ${response.message || 'Failed to complete action.'}`;
          console.error("Action failed:", response);
        } else {
          statusMessage.textContent = 'Error: No response from background script.';
          console.error("No response from background script.");
        }
        aiSortButton.disabled = false;
        domainSortButton.disabled = false;
        if (ungroupAllButton) ungroupAllButton.disabled = false;
      });
    });
  }

  handleSortAction(aiSortButton, "sortTabs", "Sorting with AI, please wait...");
  handleSortAction(domainSortButton, "groupTabsByDomain", "Grouping by domain, please wait...");
  handleSortAction(ungroupAllButton, "ungroupAllTabs", "Ungrouping all tabs, please wait...");

  // You can add more UI interactions here if needed,
  // for example, a link to the options page:
  // const optionsLink = document.createElement('a');
  // optionsLink.href = chrome.runtime.getURL('options.html');
  // optionsLink.textContent = 'Settings';
  // optionsLink.target = '_blank';
  // document.body.appendChild(optionsLink);
});