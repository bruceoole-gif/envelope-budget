// Tiny indirection so UI modules can trigger a re-render of whatever view is currently on
// screen after a mutation, without importing router.js and creating a circular dependency.
let rerenderFn = () => {};

export function setRerender(fn) {
  rerenderFn = fn;
}
export function rerender() {
  rerenderFn();
}
