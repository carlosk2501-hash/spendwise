const GrokVision = {
  _status: null,

  async checkStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Status check failed');
      this._status = await res.json();
      return this._status;
    } catch {
      this._status = { grok_configured: false, offline: true };
      return this._status;
    }
  },

  isConfigured() {
    return this._status?.grok_configured === true;
  },

  async saveApiKey(apiKey) {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save API key');
    this._status = { grok_configured: true };
    return data;
  },

  async prepareImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 2048;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.92;
        let result = canvas.toDataURL('image/jpeg', quality);

        while (result.length > 18 * 1024 * 1024 && quality > 0.4) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(result);
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = dataUrl;
    });
  },

  setProgress(message) {
    const el = document.getElementById('ocrStatus');
    if (el) {
      el.hidden = false;
      const span = el.querySelector('span');
      if (span) span.textContent = message;
    }
  },

  async scanImage(imageDataUrl) {
    if (!this.isConfigured()) {
      throw new Error('GROK_NOT_CONFIGURED');
    }

    this.setProgress('Grok AI is reading your receipt…');

    const image = await this.prepareImage(imageDataUrl);

    const res = await fetch('/api/analyze-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Grok analysis failed');
    }

    if (data.date) {
      data.date = String(data.date).slice(0, 10);
    } else {
      data.date = new Date().toISOString().split('T')[0];
    }

    return data;
  },
};