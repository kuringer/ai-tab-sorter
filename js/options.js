// AI Tab Sorter - Options Script

document.addEventListener('DOMContentLoaded', () => {
  // API Key Elements
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyButton = document.getElementById('saveApiKeyButton');
  const apiKeyStatus = document.getElementById('apiKeyStatus');

  // User Prompt Elements
  const userPromptInput = document.getElementById('userPromptInput');
  const saveUserPromptButton = document.getElementById('saveUserPromptButton');
  const userPromptStatus = document.getElementById('userPromptStatus');

  // User Groups Elements
  const userGroupsContainer = document.getElementById('userGroupsContainer');
  const newGroupNameInput = document.getElementById('newGroupName');
  const newGroupDescriptionInput = document.getElementById('newGroupDescription');
  const addUserGroupButton = document.getElementById('addUserGroupButton');

  // Sorting Mode Elements
  const sortingModeRadios = document.querySelectorAll('input[name="sortingMode"]');
  const saveSortingModeButton = document.getElementById('saveSortingModeButton');
  const sortingModeStatus = document.getElementById('sortingModeStatus');

  // Load saved settings when the page loads
  loadSettings();

  // --- API Key ---
  if (saveApiKeyButton) {
    saveApiKeyButton.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      chrome.storage.sync.set({ apiKey: apiKey }, () => {
        apiKeyStatus.textContent = 'API Key saved!';
        setTimeout(() => apiKeyStatus.textContent = '', 2000);
        console.log('API Key saved.');
      });
    });
  }

  // --- User Prompt ---
  if (saveUserPromptButton) {
    saveUserPromptButton.addEventListener('click', () => {
      const userPrompt = userPromptInput.value.trim();
      chrome.storage.sync.set({ userPrompt: userPrompt }, () => {
        userPromptStatus.textContent = 'User Prompt saved!';
        setTimeout(() => userPromptStatus.textContent = '', 2000);
        console.log('User Prompt saved.');
      });
    });
  }

  // --- User Groups ---
  if (addUserGroupButton) {
    addUserGroupButton.addEventListener('click', () => {
      const name = newGroupNameInput.value.trim();
      const description = newGroupDescriptionInput.value.trim();
      if (name && description) {
        chrome.storage.sync.get('userGroups', (data) => {
          const userGroups = data.userGroups || [];
          userGroups.push({ name, description, id: `group_${Date.now()}` });
          chrome.storage.sync.set({ userGroups }, () => {
            renderUserGroups(userGroups);
            newGroupNameInput.value = '';
            newGroupDescriptionInput.value = '';
            console.log('User group added.');
          });
        });
      } else {
        alert('Please enter both a name and a description for the group.');
      }
    });
  }

  function renderUserGroups(groups) {
    userGroupsContainer.innerHTML = ''; // Clear existing groups
    if (groups && groups.length > 0) {
      const ul = document.createElement('ul');
      groups.forEach(group => {
        const li = document.createElement('li');
        li.innerHTML = `
          <strong>${group.name}</strong>: ${group.description}
          <button data-groupid="${group.id}" class="deleteGroupButton">Delete</button>
        `;
        ul.appendChild(li);
      });
      userGroupsContainer.appendChild(ul);

      // Add event listeners for delete buttons
      document.querySelectorAll('.deleteGroupButton').forEach(button => {
        button.addEventListener('click', (event) => {
          const groupIdToDelete = event.target.dataset.groupid;
          deleteUserGroup(groupIdToDelete);
        });
      });
    } else {
      userGroupsContainer.innerHTML = '<p>No user-defined groups yet.</p>';
    }
  }

  function deleteUserGroup(groupId) {
    chrome.storage.sync.get('userGroups', (data) => {
      let userGroups = data.userGroups || [];
      userGroups = userGroups.filter(group => group.id !== groupId);
      chrome.storage.sync.set({ userGroups }, () => {
        renderUserGroups(userGroups);
        console.log('User group deleted.');
      });
    });
  }

  // --- Sorting Mode ---
  if (saveSortingModeButton) {
    saveSortingModeButton.addEventListener('click', () => {
      let selectedMode = 'respect'; // default
      sortingModeRadios.forEach(radio => {
        if (radio.checked) {
          selectedMode = radio.value;
        }
      });
      chrome.storage.sync.set({ sortingMode: selectedMode }, () => {
        sortingModeStatus.textContent = 'Sorting Mode saved!';
        setTimeout(() => sortingModeStatus.textContent = '', 2000);
        console.log('Sorting Mode saved:', selectedMode);
      });
    });
  }


  // --- Load All Settings ---
  function loadSettings() {
    chrome.storage.sync.get(['apiKey', 'userPrompt', 'userGroups', 'sortingMode'], (data) => {
      if (data.apiKey) {
        apiKeyInput.value = data.apiKey;
      }
      if (data.userPrompt) {
        userPromptInput.value = data.userPrompt;
      }
      renderUserGroups(data.userGroups || []);
      if (data.sortingMode) {
        sortingModeRadios.forEach(radio => {
          if (radio.value === data.sortingMode) {
            radio.checked = true;
          }
        });
      }
      console.log('Settings loaded:', data);
    });
  }
});