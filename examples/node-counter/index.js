var createStore = require('redux').createStore
var devTools = require('remote-redux-devtools')

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

var store = createStore(counter, devTools({
  hostname: "localhost",
  port: 8000,
  realtime: true}))
store.subscribe(function() { console.log(store.getState()) })

function incrementer() {
  setTimeout(function() {
    store.dispatch({ type: 'INCREMENT' })
    incrementer()
  }, 1000)
}

incrementer()
