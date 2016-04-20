import { stringify, parse } from 'jsan';
import socketCluster from 'socketcluster-client';
import configureStore from './configureStore';
import { socketOptions } from './constants';

let instanceName;
let socket;
let channel;
let store = {};
let lastAction;
let filters;
let isExcess;
let isMonitored;

function isFiltered(action) {
  if (!action || !action.action || !action.action.type) return false;
  return (
    filters.whitelist && !action.action.type.match(filters.whitelist.join('|')) ||
    filters.blacklist && action.action.type.match(filters.blacklist.join('|'))
  );
}

function relay(type, state, action, nextActionId) {
  if (filters && isFiltered(action)) return;
  const message = {
    payload: state ? stringify(state) : '',
    action: action ? stringify(action) : '',
    nextActionId: nextActionId || '',
    type,
    id: socket.id,
    name: instanceName,
    isExcess
  };
  socket.emit(socket.id ? 'log' : 'log-noid', message);
}

function filterStagedActions(state) {
  if (!filters) return state;

  const filteredStagedActionIds = [];
  const filteredComputedStates = [];

  state.stagedActionIds.forEach((id, idx) => {
    if (!isFiltered(state.actionsById[id])) {
      filteredStagedActionIds.push(id);
      filteredComputedStates.push(state.computedStates[idx]);
    }
  });

  return { ...state,
    stagedActionIds: filteredStagedActionIds,
    computedStates: filteredComputedStates
  };
}

function handleMessages(message) {
  if (message.type === 'ACTION') {
    store.dispatch(message.action);
  } if (message.type === 'DISPATCH') {
    store.liftedStore.dispatch(message.action);
  } else if (message.type === 'UPDATE') {
    relay('STATE', filterStagedActions(store.liftedStore.getState()));
  } else if (message.type === 'SYNC') {
    if (socket.id && message.id !== socket.id) {
      store.liftedStore.dispatch({
        type: 'IMPORT_STATE', nextLiftedState: parse(message.state)
      });
    }
  } else if (message.type === 'START') {
    isMonitored = true;
  } else if (message.type === 'STOP' || message.type === 'DISCONNECTED') {
    isMonitored = false;
    relay('STOP');
  }
}

function init(options) {
  if (channel) channel.unwatch();
  if (socket) socket.disconnect();
  if (options && options.port && !options.hostname) {
    options.hostname = 'localhost';
  }
  socket = socketCluster.connect(options && options.port ? options : socketOptions);

  socket.on('error', function (err) {
    console.warn(err);
  });

  socket.emit('login', 'master', (err, channelName) => {
    if (err) { console.warn(err); return; }
    channel = socket.subscribe(channelName);
    channel.watch(handleMessages);
    socket.on(channelName, handleMessages);
  });
  if (options && options.filters) {
    filters = options.filters;
  }
  if (options) instanceName = options.name;
  relay('STATE', store.liftedStore.getState());
}

function monitorReducer(state = {}, action) {
  lastAction = action.type;
  return state;
}

function handleChange(state, liftedState, maxAge) {
  const nextActionId = liftedState.nextActionId;
  const liftedAction = liftedState.actionsById[nextActionId - 1];
  const action = liftedAction.action;
  if (action.type === '@@INIT') {
    relay('INIT', state, { timestamp: Date.now() });
  } else if (lastAction !== 'TOGGLE_ACTION' && lastAction !== 'SWEEP') {
    if (lastAction === 'JUMP_TO_STATE') return;
    relay('ACTION', state, liftedAction, nextActionId);
    if (!isExcess && maxAge) isExcess = liftedState.stagedActionIds.length >= maxAge;
  } else {
    relay('STATE', filterStagedActions(liftedState));
  }
}

export default function devTools(options) {
  const maxAge = options && options.maxAge || 30;
  return (next) => {
    return (reducer, initialState) => {
      store = configureStore(
        next, monitorReducer, { maxAge }
      )(reducer, initialState);
      init(options);
      store.subscribe(() => {
        if (isMonitored) handleChange(store.getState(), store.liftedStore.getState(), maxAge);
      });
      return store;
    };
  };
}
