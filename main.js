window.onload = () => {
  const canvas = document.getElementById('canvas');
  
  const gl = canvas.getContext('webgl2');
  gl.getExtension('EXT_color_buffer_float');

  if (!gl) {
    alert('webgl2 not supported');
    return;
  }

  const stats = new Stats();
  const container = document.getElementById('container');
  container.appendChild(stats.domElement);

  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  addEventListener('resize', resizeCanvas);
  resizeCanvas();

  gl.viewport(0.0, 0.0, canvas.width, canvas.height);
  
  let initializeDensityProgram = createProgram('vs', 'initialize_density_fs');
  let addDensitySourceProgram = createProgram('vs', 'add_density_fs');
  let diffuseDensityProgram = createProgram('vs', 'diffuse_density_fs');
  let advectDensityProgram = createProgram('vs', 'advect_density_fs');
  let initializeVelocityProgram = createProgram('vs', 'initialize_velocity_fs');
  let addExternalForceProgram = createProgram('vs', 'add_external_force_fs');
  let diffuseVelocityProgram = createProgram('vs', 'diffuse_velocity_fs');
  let advectVelocityProgram = createProgram('vs', 'advect_velocity_fs');
  let projectionStep01Program = createProgram('vs', 'projection_step01_fs');
  let projectionStep02Program = createProgram('vs', 'projection_step02_fs');
  let projectionStep03Program = createProgram('vs', 'projection_step03_fs');
  let renderVelocityProgram = createProgram('vs', 'render_velocity_fs');
  let renderDensityProgram = createProgram('vs', 'render_density_fs');

  let initializeDensityUniforms = getUniformLocations(initializeDensityProgram, ['u_texture', 'u_resolution']);
  let addDensitySourceUniforms = getUniformLocations(addDensitySourceProgram, ['u_density_texture']);
  let diffuseDensityUniforms = getUniformLocations(diffuseDensityProgram, ['u_density_texture', 'u_grid_space', 'u_dt', 'u_diffuse']);
  let advectDensityUniforms = getUniformLocations(advectDensityProgram, ['u_density_texture', 'u_velocity_texture', 'u_grid_space', 'u_dt']);
  let addExternalForceUniforms = getUniformLocations(addExternalForceProgram, ['u_velocity_texture', 'u_grid_space', 'u_dt', 'u_force_rad', 'u_force_center', 'u_force_direction', 'u_force_intensity']);
  let diffuseVelocityUniforms = getUniformLocations(diffuseVelocityProgram, ['u_velocity_texture', 'u_grid_space', 'u_dt', 'u_diffuse', 'u_resolution']);
  let advectVelocityUniforms = getUniformLocations(advectVelocityProgram, ['u_velocity_texture', 'u_grid_space', 'u_dt', 'u_resolution']);
  let projectionStep01Uniforms = getUniformLocations(projectionStep01Program, ['u_velocity_texture', 'u_grid_space']);
  let projectionStep02Uniforms = getUniformLocations(projectionStep02Program, ['u_project_texture']);
  let projectionStep03Uniforms = getUniformLocations(projectionStep03Program, ['u_velocity_texture', 'u_project_texture', 'u_grid_space']);
  let renderVelocityUniforms = getUniformLocations(renderVelocityProgram, ['u_velocity_texture']);
  let renderDensityUniforms = getUniformLocations(renderDensityProgram, ['u_density_texture']);

  let prevMousePosition = [0.0, 0.0];
  let mousePosition = [0.0, 0.0];
  let mouseDirection = [0.0, 0.0];
  let mouseMoved = false;

  window.addEventListener('mousemove', (e) => {
    prevMousePosition = mousePosition;
    mousePosition = [e.clientX, canvas.height - e.clientY];
    if (prevMousePosition != mousePosition) {
      mouseDirection[0] = mousePosition[0] - prevMousePosition[0];
      mouseDirection[1] = mousePosition[1] - prevMousePosition[1];
      mouseMoved = true;
    }
  });

  let mousePress = false;
  window.addEventListener('mousedown', () => {
    mousePress = true;
  });
  window.addEventListener('mouseup', () => {
    mousePress = false;
  });

  render();

  function render() {

    let params = {
      render: document.getElementById('render').checked,
      grid_space: 0.001,
      force_rad: document.getElementById('force_rad').value,
      force_intensity: document.getElementById('force_intensity').value,
      diffuse: document.getElementById('diffuse').value,
      time_step: document.getElementById('time_step').value
    };

    // swapping functions
    let velocityFBObjR = createFramebuffer(canvas.width, canvas.height);
    let velocityFBObjW = createFramebuffer(canvas.width, canvas.height);
    function swapVelocityFBObj() {
      let tmp = velocityFBObjR;
      velocityFBObjR = velocityFBObjW;
      velocityFBObjW = tmp;
    };

    let densityFBObjR = createFramebuffer(canvas.width, canvas.height);
    let densityFBObjW = createFramebuffer(canvas.width, canvas.height);
    function swapDensityFBObj() {
      let tmp = densityFBObjR;
      densityFBObjR = densityFBObjW;
      densityFBObjW = tmp;
    };

    let projectFBObjR = createFramebuffer(canvas.width, canvas.height);
    let projectFBObjW = createFramebuffer(canvas.width, canvas.height);
    function swapProjectFBObj() {
      let tmp = projectFBObjR;
      projectFBObjR = projectFBObjW;
      projectFBObjW = tmp;
    };

    // rendering functions
    function initializeVelocity() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBObjW.framebuffer);
      gl.useProgram(initializeVelocityProgram);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapVelocityFBObj();
    }

    function initializeDensity() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, densityFBObjW.framebuffer);
      gl.useProgram(initializeDensityProgram);
      gl.uniform2f(initializeDensityUniforms['u_resolution'], canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapDensityFBObj();
    }

    function addExternalForce() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBObjW.framebuffer);
      gl.useProgram(addExternalForceProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
      gl.uniform1i(addExternalForceUniforms['u_velocity_texture'], 0);
      gl.uniform1f(addExternalForceUniforms['u_grid_space'], params.grid_space);
      gl.uniform1f(addExternalForceUniforms['u_dt'], params.time_step);
      gl.uniform1f(addExternalForceUniforms['u_force_rad'], params.force_rad);
      gl.uniform2fv(addExternalForceUniforms['u_force_center'], mousePosition);
      gl.uniform2fv(addExternalForceUniforms['u_force_direction'], mouseDirection);
      gl.uniform1f(addExternalForceUniforms['u_force_intensity'], params.force_intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapVelocityFBObj();
    }

    function diffuseVelocity() {
      gl.useProgram(diffuseVelocityProgram);
      gl.uniform1f(diffuseVelocityUniforms['u_grid_space'], params.grid_space);
      gl.uniform1f(diffuseVelocityUniforms['u_dt'], params.time_step);
      gl.uniform1f(diffuseVelocityUniforms['u_diffuse'], params.diffuse);
      gl.uniform2f(diffuseVelocityUniforms['u_resolution'], canvas.width, canvas.height);
      for (let k = 0; k < 10; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBObjW.framebuffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
        gl.uniform1i(diffuseVelocityUniforms['u_velocity_texture'], 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        swapVelocityFBObj();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    function advectVelocity() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBObjW.framebuffer);
      gl.useProgram(advectVelocityProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
      gl.uniform1i(advectVelocityUniforms['u_velocity_texture'], 0);
      gl.uniform1f(advectVelocityUniforms['u_grid_space'], params.grid_space);
      gl.uniform1f(advectVelocityUniforms['u_dt'], params.time_step);
      gl.uniform2f(advectVelocityUniforms['u_resolution'], canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapVelocityFBObj();
    }

    function projectStep01() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, projectFBObjW.framebuffer);
      gl.useProgram(projectionStep01Program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
      gl.uniform1i(projectionStep01Uniforms['u_velocity_texture'], 0);
      gl.uniform1f(projectionStep01Uniforms['u_grid_space'], params.grid_space);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapProjectFBObj();
    }

    function projectStep02() {
      gl.useProgram(projectionStep02Program);
      for (let k = 0; k < 10; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, projectFBObjW.framebuffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, projectFBObjR.texture);
        gl.uniform1i(projectionStep02Uniforms['u_project_texture'], 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        swapProjectFBObj();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function projectStep03() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBObjW.framebuffer);
      gl.useProgram(projectionStep03Program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
      gl.uniform1i(projectionStep03Uniforms['u_velocity_texture'], 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, projectFBObjR.texture);
      gl.uniform1i(projectionStep03Uniforms['u_project_texture'], 1);
      gl.uniform1f(projectionStep03Uniforms['u_grid_space'], params.grid_space);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapVelocityFBObj();
    }

    function projectVelocity() {
      projectStep01();
      projectStep02();
      projectStep03();
    }

    function updateVelocity() {
      if (mousePress && mouseMoved) {
        addExternalForce();
      }
      if (params.diffuse > 0.0) {
        diffuseVelocity();
      }
      projectVelocity();
      advectVelocity();
      projectVelocity();
    }

    function addDensitySource() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, densityFBObjW.framebuffer);
      gl.useProgram(addDensitySourceProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, densityFBObjR.texture);
      gl.uniform1i(addDensitySourceUniforms['u_density_texture'], 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapDensityFBObj();
    };

    function diffuseDensity() {
      gl.useProgram(diffuseDensityProgram);
      gl.uniform1f(diffuseDensityUniforms['u_grid_space'], params.grid_space);
      gl.uniform1f(diffuseDensityUniforms['u_dt'], params.time_step);
      gl.uniform1f(diffuseDensityProgram['u_diffuse'], params.diffuse);
      for (let k = 0; k < 10; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, densityFBObjW.framebuffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, densityFBObjR.texture);
        gl.uniform1i(diffuseDensityUniforms['u_density_texture'], 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        swapDensityFBObj();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function advectDensity() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, densityFBObjW.framebuffer);
      gl.useProgram(advectDensityProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
      gl.uniform1i(advectDensityUniforms['u_velocity_texture'], 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, densityFBObjR.texture);
      gl.uniform1i(advectDensityUniforms['u_density_texture'], 1);
      gl.uniform1f(advectDensityUniforms['u_grid_space'], params.grid_space);
      gl.uniform1f(advectDensityUniforms['u_dt'], params.time_step);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      swapDensityFBObj();
    }

    function updateDensity() {
      addDensitySource();
      if (params.diffuse > 0.0) {
        diffuseDensity();
      }
      advectDensity();
    }

    function renderVelocity() {
      gl.useProgram(renderVelocityProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocityFBObjR.texture);
      gl.uniform1i(renderVelocityUniforms['u_velocity_texture'], 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function renderDensity() {
      gl.useProgram(renderDensityProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, densityFBObjR.texture);
      gl.uniform1i(renderDensityUniforms['u_density_texture'], 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    initializeVelocity();
    initializeDensity();

    loop();

    function loop() {

      stats.update();

      gl.viewport(0.0, 0.0, canvas.width, canvas.height);

      params = {
        render: document.getElementById('render').checked,
        grid_space: 0.001,
        force_rad: document.getElementById('force_rad').value,
        force_intensity: document.getElementById('force_intensity').value,
        diffuse: document.getElementById('diffuse').value,
        time_step: document.getElementById('time_step').value
      };

      let e_render = document.getElementById('disp_render');
      let e_force_rad = document.getElementById('disp_force_rad');
      let e_force_intensity = document.getElementById('disp_force_intensity');
      let e_diffuse = document.getElementById('disp_diffuse');
      let e_time_step = document.getElementById('disp_time_step');
      
      e_force_rad.innerHTML = String(params.force_rad);
      e_force_intensity.innerHTML = String(params.force_intensity);
      e_diffuse.innerHTML = String(params.diffuse);
      e_time_step.innerHTML = String(params.time_step);

      updateVelocity();
      updateDensity();

      if (params.render) {
        e_render.innerHTML = 'Velocity';
        renderVelocity();
      } else {
        e_render.innerHTML = 'Density';
        renderDensity();
      }

      mouseMoved = false;

      requestAnimationFrame(loop);
    }
  }

  function createProgram(vs_id, fs_id) {

    function createShader(id) {

      let shader;
  
      let scriptElement = document.getElementById(id);
  
      if (!scriptElement) {return;}
  
      switch (scriptElement.type) {

          case 'x-shader/x-vertex':
              shader = gl.createShader(gl.VERTEX_SHADER);
              break;
          case 'x-shader/x-fragment':
              shader = gl.createShader(gl.FRAGMENT_SHADER);
              break;
          default:
              return;
      }
  
      gl.shaderSource(shader, scriptElement.text);
  
      gl.compileShader(shader);
  
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          return shader;
      } else {
          alert(gl.getShaderInfoLog(shader));
      }
   }

    let vs = createShader(vs_id);
    let fs = createShader(fs_id);

    let program = gl.createProgram();
    
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);

    gl.linkProgram(program);

    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.useProgram(program);

      return program;
    } else {
      alert(gl.getProgramInfoLog(program));
    }
  }

  function getUniformLocations(program, uniforms) {

    let locations = {};

    for (let i = 0; i < uniforms.length; i++) {
      locations[uniforms[i]] = (gl.getUniformLocation(program, uniforms[i]));
    }

    return locations;
  }

  function createTexture(width, height, internalFormat, format, type) {

    let tex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
  }

  function createFramebuffer(width, height) {

    let framebuffer = gl.createFramebuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    let texture = createTexture(width, height, gl.RG32F, gl.RG, gl.FLOAT);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
      framebuffer: framebuffer,
      texture: texture
    };
  }
}


