// Keyboard handler that makes a clickable non-button element respond to Enter / Space.
export function activateOnKey(action) {
  return (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action(event);
    }
  };
}
