import { EventData } from 'data/observable';
import { Page } from 'ui/page';
import { isAndroid } from "platform";
import { createStore } from 'redux';
var devTools = require('remote-redux-devtools').default;

// Event handler for Page "navigatingTo" event attached in main-page.xml
export function navigatingTo(args: EventData) {
  // Get the event sender
  let page = <Page>args.object;
}

// console.log("devTools: " + devTools);
function counter(state, action) {
  if (state === undefined) state = 0
  switch (action.type) {
  case 'INCREMENT':
    return state + 1
  case 'DECREMENT':
    return state - 1
  default:
    return state
  }
}

var hostname = isAndroid ? "10.0.3.2" : "localhost";

var store = createStore(counter, devTools({
  hostname,
  port: 8000,
  realtime: true}))
store.subscribe(function() { console.log(store.getState()) })

function incrementer() {
  setTimeout(function() {
    store.dispatch({ type: 'INCREMENT' })
    incrementer()
  }, 1000)
}

incrementer();