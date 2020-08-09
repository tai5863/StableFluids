window.onload = () => {
  const canvas = document.body.appendChild(document.createElement('canvas'));
  
  const gl = canvas.getContext('webgl');

  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  addEventListerner('resize', resizeCanvas);
  resizeCanvas();
}
