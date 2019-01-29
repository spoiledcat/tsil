import { createStore } from 'redux';

function handleState(state: { action: string } | undefined, action: { type: string }) : { action: string } {
    if (state === undefined) return { action: action.type };
    state.action = action.type;
    return state;
}

let store = createStore(handleState);
store.subscribe(() => console.log(store.getState()));

store.dispatch({ type: 'START' });
store.dispatch({ type: 'CONTINUE' });
store.dispatch({ type: 'END' });
