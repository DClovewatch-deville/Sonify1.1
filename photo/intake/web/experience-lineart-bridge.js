/* Bridge for Paint Fourier line-art integration */
'use strict';

class LineArtBridge {
  constructor() {
    this.modal = null;
    this.iframe = null;
    this.resolver = null;
    this.requestId = null;
    this.originalImage = null;
    this.messageHandler = null;
    this.loadTimeout = null;
    this.operationTimeout = null;
    this.escapeHandler = null;
    this.triggerElement = null;
  }

  async extract(imageDataURL) {
    if (this.resolver) throw new Error('线稿提取正在进行中。');
    if (!imageDataURL || typeof imageDataURL !== 'string') throw new Error('无效的图片数据。');
    if (imageDataURL.length > 18 * 1024 * 1024) throw new Error('图片数据过大（超过18MB）。');
    
    const match = imageDataURL.match(/^data:image\/(png|jpeg);base64,/);
    if (!match) throw new Error('仅支持PNG或JPEG格式。');

    this.triggerElement = document.activeElement;
    this.originalImage = imageDataURL;
    
    return new Promise((resolve, reject) => {
      this.resolver = resolve;
      this.loaded = false;
      this.requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      
      this.createModal();
      this.setupMessageHandler();
      this.setupEscapeHandler();
      
      this.loadTimeout = setTimeout(() => {
        this.resolver = null;
        this.cleanup(true);
        reject(new Error('线稿工具加载超时（45秒）。'));
      }, 45000);
      
      this.operationTimeout = setTimeout(() => {
        this.resolver = null;
        this.cleanup(true);
        reject(new Error('操作超时（10分钟）。'));
      }, 600000);
      
      this.iframe = document.createElement('iframe');
      this.iframe.title = '本地精细线稿工作台';
      this.iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
      this.iframe.src = '/paint/modules/fourier/Sonify-Fourier.html?bridge=photo';
      
      const container = this.modal.querySelector('.lineart-iframe-container');
      container.appendChild(this.iframe);
    });
  }

  createModal() {
    if (!document.getElementById('lineart-bridge-styles')) {
      const style = document.createElement('style');
      style.id = 'lineart-bridge-styles';
      style.textContent = `
        .lineart-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:100000;display:flex;align-items:center;justify-content:center;padding:2vh;}
        .lineart-modal{background:#fff;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;flex-direction:column;width:96vw;height:92vh;max-width:1400px;max-height:900px;}
        @media(max-width:768px){.lineart-modal{width:100%;height:100%;max-width:none;max-height:none;border-radius:0;}}
        .lineart-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e0e0e0;flex-shrink:0;}
        .lineart-modal-title{font-size:18px;font-weight:600;color:#333;margin:0;}
        .lineart-modal-close{background:transparent;border:none;font-size:28px;line-height:1;color:#666;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:background 0.2s;}
        .lineart-modal-close:hover{background:#f0f0f0;color:#333;}
        .lineart-iframe-container{flex:1;overflow:hidden;position:relative;}
        .lineart-loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:16px;color:#666;}
      `;
      document.head.appendChild(style);
    }

    this.modal = document.createElement('div');
    this.modal.className = 'lineart-modal-overlay';
    this.modal.innerHTML = `
      <div class="lineart-modal" role="dialog" aria-modal="true" aria-labelledby="lineart-title">
        <div class="lineart-modal-header">
          <h2 class="lineart-modal-title" id="lineart-title">正在加载线稿工具...</h2>
          <button class="lineart-modal-close" aria-label="关闭" title="关闭">&times;</button>
        </div>
        <div class="lineart-iframe-container"></div>
      </div>
    `;
    
    document.body.appendChild(this.modal);
    
    this.modal.querySelector('.lineart-modal-close').addEventListener('click', () => {
      this.handleCancel();
    });
    
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.handleCancel();
    });

    this.modal.querySelector('.lineart-modal-close').focus();
  }

  setupMessageHandler() {
    this.messageHandler = (event) => {
      if (!this.iframe || event.source !== this.iframe.contentWindow) return;
      
      const origin = new URL(location.href).origin;
      if (event.origin !== origin) return;
      
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'sonify:lineart:ready') {
        this.handleReady();
      } else if (msg.type === 'sonify:lineart:result' && msg.requestId === this.requestId) {
        this.handleResult(msg);
      } else if (msg.type === 'sonify:lineart:error' && msg.requestId === this.requestId) {
        const resolve = this.resolver; this.resolver = null; this.cleanup(true);
        resolve?.({success:false,error:String(msg.error || '线稿处理失败')});
      } else if (msg.type === 'sonify:lineart:cancel' && msg.requestId === this.requestId) {
        this.handleCancel();
      }
    };
    
    window.addEventListener('message', this.messageHandler);
  }

  setupEscapeHandler() {
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') this.handleCancel();
    };
    window.addEventListener('keydown', this.escapeHandler);
  }

  handleReady() {
    if (this.loaded) return;
    this.loaded = true;
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }
    
    const title = this.modal.querySelector('.lineart-modal-title');
    if (title) title.textContent = '提取线稿 - 选择主体并应用';
    
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage({
        type: 'sonify:lineart:load',
        image: this.originalImage,
        requestId: this.requestId
      }, location.origin);
    }
  }

  handleResult(msg) {
    if (!this.validateResult(msg)) {
      this.cleanup(true);
      if (this.resolver) {
        this.resolver({ success: false, error: '返回数据格式错误。' });
        this.resolver = null;
      }
      return;
    }

    if (this.resolver) {
      this.resolver({ 
        success: true, 
        original: this.originalImage,
        lineart: msg.lineart,
        method: msg.method,
        width: msg.width,
        height: msg.height
      });
      this.resolver = null;
    }
    this.cleanup(true);
  }

  handleCancel() {
    if (this.resolver) {
      this.resolver({ success: false, canceled: true });
      this.resolver = null;
    }
    this.cleanup(true);
  }

  validateResult(msg) {
    if (!msg.lineart || typeof msg.lineart !== 'string') return false;
    if (!msg.lineart.startsWith('data:image/png;base64,')) return false;
    if (msg.lineart.length < 100 || msg.lineart.length > 18 * 1024 * 1024) return false;
    
    if (msg.method !== 'slimsam' && msg.method !== 'traditional') return false;
    
    if (!Number.isInteger(msg.width) || !Number.isInteger(msg.height)) return false;
    if (msg.width < 1 || msg.width > 8192 || msg.height < 1 || msg.height > 8192) return false;
    
    return true;
  }

  cleanup(restoreFocus) {
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
      this.loadTimeout = null;
    }
    
    if (this.operationTimeout) {
      clearTimeout(this.operationTimeout);
      this.operationTimeout = null;
    }
    
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    
    if (this.escapeHandler) {
      window.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
    
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    
    if (restoreFocus && this.triggerElement) {
      if (this.triggerElement.isConnected) this.triggerElement.focus();
    }
    
    this.requestId = null;
    this.originalImage = null;
    this.triggerElement = null;
  }

  destroy() {
    if (this.resolver) {
      this.resolver({ success: false, canceled: true });
      this.resolver = null;
    }
    this.cleanup(false);
  }
}

window.LineArtBridge = LineArtBridge;
