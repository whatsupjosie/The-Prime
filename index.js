document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.querySelector('.btn-primary');
  if (startButton) {
    startButton.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = '/dressing-room';
    });
  }
});
