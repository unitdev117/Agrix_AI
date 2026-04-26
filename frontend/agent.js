(() => {
  const status = document.getElementById('status');
  const apiBaseUrlInput = document.getElementById('apiBaseUrl');
  const refreshBtn = document.getElementById('refreshBtn');

  const telegramBody = document.getElementById('telegramBody');
  const telegramEmpty = document.getElementById('telegramEmpty');
  const telegramCount = document.getElementById('telegramCount');

  const webBody = document.getElementById('webBody');
  const webEmpty = document.getElementById('webEmpty');
  const webCount = document.getElementById('webCount');

  const formatDate = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString();
  };

  const setStatus = (text) => {
    status.textContent = text;
  };

  const clearTables = () => {
    telegramBody.innerHTML = '';
    webBody.innerHTML = '';
  };

  const renderTelegramUsers = (users) => {
    telegramBody.innerHTML = '';
    telegramCount.textContent = `(${users.length})`;

    if (!users.length) {
      telegramEmpty.style.display = 'block';
      return;
    }

    telegramEmpty.style.display = 'none';

    users.forEach((user) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user.firstName || '-'}</td>
        <td>${user.username || '-'}</td>
        <td>${user.language || '-'}</td>
        <td>${user.usageCount || 0}</td>
        <td>${formatDate(user.lastUsedAt)}</td>
      `;
      telegramBody.appendChild(row);
    });
  };

  const renderWebUsers = (users) => {
    webBody.innerHTML = '';
    webCount.textContent = `(${users.length})`;

    if (!users.length) {
      webEmpty.style.display = 'block';
      return;
    }

    webEmpty.style.display = 'none';

    users.forEach((user) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user.fullName || '-'}</td>
        <td>${user.phoneNumber || '-'}</td>
        <td>${user.sessionsCount || 0}</td>
        <td>${formatDate(user.lastSeenAt)}</td>
      `;
      webBody.appendChild(row);
    });
  };

  const readBaseUrl = () => {
    const raw = apiBaseUrlInput.value.trim();
    return raw || 'http://localhost:8000';
  };

  const loadDashboard = async () => {
    clearTables();
    telegramEmpty.style.display = 'none';
    webEmpty.style.display = 'none';
    setStatus('Loading dashboard data...');

    const apiBaseUrl = readBaseUrl();

    try {
      const [telegramResponse, webResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/dashboard/telegram-users`),
        fetch(`${apiBaseUrl}/api/dashboard/web-users`),
      ]);

      if (!telegramResponse.ok) {
        throw new Error(`Telegram API failed: ${telegramResponse.status}`);
      }

      if (!webResponse.ok) {
        throw new Error(`Web API failed: ${webResponse.status}`);
      }

      const [telegramData, webData] = await Promise.all([
        telegramResponse.json(),
        webResponse.json(),
      ]);

      renderTelegramUsers(Array.isArray(telegramData.users) ? telegramData.users : []);
      renderWebUsers(Array.isArray(webData.users) ? webData.users : []);

      setStatus(`Last updated: ${new Date().toLocaleString()}`);
    } catch (error) {
      telegramCount.textContent = '(0)';
      webCount.textContent = '(0)';
      telegramEmpty.style.display = 'block';
      webEmpty.style.display = 'block';
      setStatus(`Failed to load dashboard: ${error.message}`);
    }
  };

  refreshBtn.addEventListener('click', loadDashboard);

  loadDashboard();
})();
