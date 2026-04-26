(() => {
  const SOCKET_BASE_URL = window.localStorage.getItem('socketBaseUrl') || 'http://localhost:8000';
  const SITE_KEY = window.localStorage.getItem('widgetSiteKey') || 'dev-site-key';

  const ensureWidgetUserId = () => {
    let userId = window.localStorage.getItem('agrix_widget_user_id');
    if (!userId) {
      userId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem('agrix_widget_user_id', userId);
    }
    return userId;
  };

  const state = {
    sessionId: window.localStorage.getItem('agrix_widget_session_id') || null,
    userId: ensureWidgetUserId(),
    currentState: null,
    routeChoice: null,
    pendingAiChunks: {},
    profileStep: null,
    pendingProfile: {
      fullName: '',
      phoneNumber: '',
    },
    routePromptShown: false,
    aiIntroShown: false,
  };

  const panel = document.getElementById('widgetPanel');
  const toggleButton = document.getElementById('widgetToggle');
  const messages = document.getElementById('messages');

  const quickActions = document.getElementById('quickActions');
  const talkAiBtn = document.getElementById('talkAiBtn');
  const talkPersonnelBtn = document.getElementById('talkPersonnelBtn');

  const profileControls = document.getElementById('profileControls');
  const profileInput = document.getElementById('profileInput');
  const profileSend = document.getElementById('profileSend');

  const chatControls = document.getElementById('chatControls');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');

  const socket = window.io(`${SOCKET_BASE_URL}/widget`, {
    transports: ['websocket'],
    auth: {
      siteKey: SITE_KEY,
    },
  });

  const messageId = () => {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const appendMessage = ({ senderType, text, id }) => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${senderType === 'widget_user' ? 'user' : senderType}`;
    if (id) {
      bubble.dataset.messageId = id;
    }
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };

  const upsertStreamMessage = ({ messageId: aiMessageId, text, isPartial }) => {
    let bubble = messages.querySelector(`[data-message-id="${aiMessageId}"]`);

    if (!bubble) {
      bubble = appendMessage({ senderType: 'ai', text: '', id: aiMessageId });
    }

    const prev = state.pendingAiChunks[aiMessageId] || '';
    const next = `${prev}${text}`;
    state.pendingAiChunks[aiMessageId] = next;

    // Use marked.js if available, otherwise fallback to plain text
    if (window.marked && typeof window.marked.parse === 'function') {
      bubble.innerHTML = window.marked.parse(next);
    } else {
      bubble.textContent = next;
    }

    if (!isPartial) {
      delete state.pendingAiChunks[aiMessageId];
    }

    messages.scrollTop = messages.scrollHeight;
  };

  const setUiForState = () => {
    const inRouteChoice = state.currentState === 'route_choice';
    const inAiChat = state.currentState === 'ai_chat';

    quickActions.style.display = inRouteChoice && !state.profileStep ? 'flex' : 'none';
    profileControls.style.display = inRouteChoice && Boolean(state.profileStep) ? 'flex' : 'none';
    chatControls.style.display = inAiChat ? 'flex' : 'none';

    if (inRouteChoice && !state.routePromptShown) {
      appendMessage({
        senderType: 'system',
        text: 'Please choose one option: Talk to Agrix AI or Talk to Agrix Personnel.',
      });
      state.routePromptShown = true;
    }

    if (!inRouteChoice) {
      state.routePromptShown = false;
    }

    if (inAiChat && !state.aiIntroShown) {
      appendMessage({
        senderType: 'system',
        text: 'You are now connected to Agrix AI. Ask your question.',
      });
      state.aiIntroShown = true;
    }
  };

  const sendEvent = (eventName, payload, onOk) => {
    socket.emit(eventName, payload, (ack) => {
      if (!ack || !ack.ok) {
        const message = ack?.error?.message || 'Unknown socket error';
        appendMessage({ senderType: 'system', text: `Error: ${message}` });
        return;
      }

      if (typeof onOk === 'function') {
        onOk(ack);
      }
    });
  };

  const startSession = () => {
    sendEvent('session:start', {
      messageId: messageId(),
      sessionId: state.sessionId,
      userId: state.userId,
      displayName: 'Website Visitor',
    }, (ack) => {
      if (ack.sessionId) {
        state.sessionId = ack.sessionId;
        window.localStorage.setItem('agrix_widget_session_id', ack.sessionId);
      }
    });
  };

  const beginAiFlow = () => {
    if (state.currentState !== 'route_choice' || !state.sessionId) {
      return;
    }

    state.pendingProfile = {
      fullName: '',
      phoneNumber: '',
    };
    state.profileStep = 'name';

    setUiForState();
    appendMessage({ senderType: 'system', text: 'Please enter your complete name.' });
    profileInput.value = '';
    profileInput.placeholder = 'Complete name';
    profileInput.focus();
  };

  const submitProfileAndStartAi = () => {
    const fullName = state.pendingProfile.fullName.trim();
    const phoneNumber = state.pendingProfile.phoneNumber.trim();

    sendEvent('profile:submit', {
      messageId: messageId(),
      sessionId: state.sessionId,
      fullName,
      phoneNumber,
    }, () => {
      sendEvent('route:choose', {
        messageId: messageId(),
        sessionId: state.sessionId,
        route: 'ai',
      });

      state.profileStep = null;
      setUiForState();
    });
  };

  socket.on('connect', () => {
    appendMessage({ senderType: 'system', text: 'Connected to Agrix support.' });
    startSession();
  });

  socket.on('session:state', (payload) => {
    if (payload.sessionId) {
      state.sessionId = payload.sessionId;
      window.localStorage.setItem('agrix_widget_session_id', payload.sessionId);
    }

    state.currentState = payload.state;
    state.routeChoice = payload.routeChoice || null;

    setUiForState();

    if (state.currentState === 'closed') {
      appendMessage({ senderType: 'system', text: 'Session closed.' });
      profileSend.disabled = true;
      talkAiBtn.disabled = true;
      talkPersonnelBtn.disabled = true;
      chatSend.disabled = true;
    }
  });

  socket.on('chat:message', (payload) => {
    if (payload.senderType === 'ai') {
      upsertStreamMessage(payload);
      return;
    }

    appendMessage({ senderType: payload.senderType || 'system', text: payload.text });
  });

  socket.on('handoff:status', (payload) => {
    if (payload.status === 'contact_only') {
      appendMessage({
        senderType: 'system',
        text: `Please contact Agrix personnel at ${payload.phone}. Do you also want to talk to Agrix AI? Click \"Talk to Agrix AI\".`,
      });
      return;
    }

    if (payload.status === 'pending') {
      appendMessage({
        senderType: 'system',
        text: `Human handoff created. Call ${payload.phone} or WhatsApp ${payload.whatsapp}.`,
      });
      return;
    }

    if (payload.status === 'accepted') {
      appendMessage({ senderType: 'system', text: `Agent ${payload.assignedAgentId || 'assigned'} joined the chat.` });
      return;
    }

    if (payload.status === 'resolved') {
      appendMessage({ senderType: 'system', text: 'Handoff resolved.' });
    }
  });

  socket.on('error:event', (payload) => {
    appendMessage({
      senderType: 'system',
      text: `${payload.code}: ${payload.message}`,
    });
  });

  socket.on('disconnect', () => {
    appendMessage({ senderType: 'system', text: 'Disconnected. Reconnecting...' });
  });

  toggleButton.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  panel.classList.add('open');

  talkAiBtn.addEventListener('click', beginAiFlow);

  talkPersonnelBtn.addEventListener('click', () => {
    if (state.currentState !== 'route_choice' || !state.sessionId) {
      return;
    }

    sendEvent('personnel:request', {
      messageId: messageId(),
      sessionId: state.sessionId,
    });
  });

  profileSend.addEventListener('click', () => {
    const value = profileInput.value.trim();
    if (!value || !state.sessionId || state.currentState !== 'route_choice') {
      return;
    }

    if (state.profileStep === 'name') {
      state.pendingProfile.fullName = value;
      appendMessage({ senderType: 'widget_user', text: value });
      state.profileStep = 'phone';
      profileInput.value = '';
      profileInput.placeholder = 'Phone number';
      appendMessage({ senderType: 'system', text: 'Please enter your phone number.' });
      profileInput.focus();
      setUiForState();
      return;
    }

    if (state.profileStep === 'phone') {
      // Validate: must be exactly 10 digits
      const cleaned = value.replace(/\s+/g, '');
      if (!/^\d{10}$/.test(cleaned)) {
        appendMessage({
          senderType: 'system',
          text: '⚠️ The phone number you entered is invalid. Please enter a valid 10-digit phone number.',
        });
        profileInput.value = '';
        profileInput.focus();
        return;
      }

      state.pendingProfile.phoneNumber = cleaned;
      appendMessage({ senderType: 'widget_user', text: cleaned });
      profileInput.value = '';
      submitProfileAndStartAi();
    }
  });

  chatSend.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text || !state.sessionId || state.currentState !== 'ai_chat') {
      return;
    }

    sendEvent('chat:user_message', {
      messageId: messageId(),
      sessionId: state.sessionId,
      text,
    });

    chatInput.value = '';
  });

  // Handle "Enter" key presses for inputs
  profileInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      profileSend.click();
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      chatSend.click();
    }
  });
})();
