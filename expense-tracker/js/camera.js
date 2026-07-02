const Camera = {
  stream: null,
  facingMode: 'environment',

  async start() {
    this.stop();

    const constraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    const video = document.getElementById('cameraVideo');
    video.srcObject = this.stream;
    await video.play();
    return this.stream;
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) video.srcObject = null;
  },

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.start();
  },

  capture() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.92);
  },

  async hasCamera() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((d) => d.kind === 'videoinput');
    } catch {
      return false;
    }
  },
};