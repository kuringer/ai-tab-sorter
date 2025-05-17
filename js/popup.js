// AI Tab Sorter - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const sortTabsButton = document.getElementById('sortTabsButton');
  const statusMessage = document.getElementById('statusMessage');

  if (sortTabsButton) {
    sortTabsButton.addEventListener('click', () => {
      statusMessage.textContent = 'Sorting tabs, please wait...';
      sortTabsButton.disabled = true;

      // Send a message to the background script to initiate sorting
      chrome.runtime.sendMessage({ action: "sortTabs", data: {} }, (response) => {
        if (chrome.runtime.lastError) {
          // Handle errors like "Receiving end does not exist" if background script is not ready
          statusMessage.textContent = `Error: ${chrome.runtime.lastError.message}`;
          console.error("Error sending message to background script:", chrome.runtime.lastError);
        } else if (response && response.success) {
          statusMessage.textContent = response.message || 'Tabs sorted successfully!';
          console.log("Sorting response from background:", response);
          // Optionally, close the popup after a short delay
          // setTimeout(() => window.close(), 2000);
        } else if (response) {
          statusMessage.textContent = `Error: ${response.message || 'Failed to sort tabs.'}`;
          console.error("Sorting failed:", response);
        } else {
          statusMessage.textContent = 'Error: No response from background script.';
          console.error("No response from background script.");
        }
        sortTabsButton.disabled = false;
      });
    });
  } else {
    console.error("Sort Tabs button not found in popup.html");
    if(statusMessage) statusMessage.textContent = "Error: UI element missing.";
  }

  // You can add more UI interactions here if needed,
  // for example, a link to the options page:
  // const optionsLink = document.createElement('a');
  // optionsLink.href = chrome.runtime.getURL('options.html');
  // optionsLink.textContent = 'Settings';
  // optionsLink.target = '_blank';
  // document.body.appendChild(optionsLink);
});