/** Lightbox Pro for Squarespace Gallery Sections
 * Copyright Will-Myers.com
 **/

class LightboxPro {
  static pluginName = 'lightbox-pro';

  static defaultSettings = {
    customArrows: false,
    zoomEnabled: true,
    downloadEnabled: true,
    shareEnabled: true,
    arrowPosition: 'default',
    description: false,
    mobileNavigationType: 'swipe'
  };

  static icons = {
    zoomIn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      <line x1="11" y1="8" x2="11" y2="14"></line>
      <line x1="8" y1="11" x2="14" y2="11"></line>
    </svg>`,
    zoomOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      <line x1="8" y1="11" x2="14" y2="11"></line>
    </svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>`,
    share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="3"></circle>
      <circle cx="6" cy="12" r="3"></circle>
      <circle cx="18" cy="19" r="3"></circle>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
    </svg>`,
    prevArrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>`,
    nextArrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>`
  };

  static emitEvent(type, detail = {}, elem = document) {
    elem.dispatchEvent(new CustomEvent(`wm-${this.pluginName}${type}`, { detail, bubbles: true }));
  }

  constructor(section, settings = {}) {
    this.section = section;
    this.sectionId = section.dataset.sectionId;
    this.lightboxWrapper = null;
    this.lightbox = null;
    this.settings = { ...LightboxPro.defaultSettings, ...settings };
    this.currentIndex = 0;
    this.totalImages = 0;
    this.zoomLevel = 1;
    this.minZoom = 1;
    this.maxZoom = 3;
    this.zoomStep = 0.5;
    this.imageData = [];
    this.slideUrlToIndex = {};
    this.isBackend = window.top !== window.self;
    this.observers = [];
    this.boundHandlers = {};
    this.headerControls = null;
    this.footer = null;
    this.countEl = null;
    this.innerContainer = null;
    this.toast = null;

    this.init();
  }

  init() {
    LightboxPro.emitEvent(':beforeInit', { el: this.section }, this.section);
    
    this.addDataAttribute();
    this.findLightbox();
    
    if (!this.lightboxWrapper) {
      console.warn(`[${LightboxPro.pluginName}] No lightbox found for section ${this.sectionId}`);
      return;
    }

    this.extractImageData();
    this.setupLightboxObserver();
    
    LightboxPro.emitEvent(':afterInit', { el: this.section }, this.section);
  }

  addDataAttribute() {
    this.section.setAttribute('data-wm-plugin', LightboxPro.pluginName);
  }

  findLightbox() {
    this.lightboxWrapper = document.querySelector(
      `.gallery-lightbox-outer-wrapper[data-lightbox-section-id="${this.sectionId}"]`
    );
    
    if (this.lightboxWrapper) {
      this.lightbox = this.lightboxWrapper.querySelector('.gallery-lightbox');
    }
  }

  extractImageData() {
    const galleryItems = this.section.querySelectorAll('.gallery-masonry-item, .gallery-grid-item, .gallery-strips-item');
    
    this.imageData = [];
    this.slideUrlToIndex = {};
    
    galleryItems.forEach((item, index) => {
      const link = item.querySelector('a.gallery-masonry-lightbox-link, a.gallery-grid-lightbox-link, a.gallery-strips-lightbox-link');
      const img = item.querySelector('img');
      const caption = item.querySelector('.gallery-caption, .gallery-caption-content, figcaption');
      
      if (link && img) {
        const href = link.getAttribute('href');
        const slideUrl = href ? href.split('itemId=')[1] : null;
        const imageSrc = img.dataset.image || img.src;
        const captionText = caption ? caption.textContent.trim() : (img.alt || '');
        
        item.setAttribute('data-lbp-index', index + 1);
        
        this.imageData.push({
          index: index + 1,
          src: imageSrc,
          originalSrc: this.getOriginalImageUrl(imageSrc),
          caption: captionText,
          slideUrl: slideUrl
        });
        
        if (slideUrl) {
          this.slideUrlToIndex[slideUrl] = index + 1;
        }
      }
    });
    
    this.totalImages = this.imageData.length;
  }

  getOriginalImageUrl(url) {
    if (!url) return url;
    
    try {
      const urlObj = new URL(url, window.location.origin);
      urlObj.searchParams.set('format', 'original');
      urlObj.searchParams.delete('content-type');
      return urlObj.toString();
    } catch (e) {
      const baseUrl = url.split('?')[0];
      return `${baseUrl}?format=original`;
    }
  }

  setupLightboxObserver() {
    if (!this.lightbox) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-open') {
          const isOpen = this.lightbox.dataset.open === 'true';
          if (isOpen) {
            this.onLightboxOpen();
          } else {
            this.onLightboxClose();
          }
        }
      });
    });

    observer.observe(this.lightbox, {
      attributes: true,
      attributeFilter: ['data-open']
    });

    this.observers.push(observer);

    if (this.lightbox.dataset.open === 'true') {
      this.onLightboxOpen();
    }
  }

  onLightboxOpen() {
    document.body.classList.add('lbp-lightbox-open');
    
    this.lightboxWrapper.setAttribute('data-lbp-active', 'true');
    this.lightboxWrapper.setAttribute('data-lbp-zoom', this.settings.zoomEnabled);
    this.lightboxWrapper.setAttribute('data-lbp-download', this.settings.downloadEnabled);
    this.lightboxWrapper.setAttribute('data-lbp-share', this.settings.shareEnabled);
    this.lightboxWrapper.setAttribute('data-lbp-arrows', this.settings.arrowPosition);
    this.lightboxWrapper.setAttribute('data-lbp-custom-arrows', this.settings.customArrows);
    
    if (this.settings.description) {
      this.lightboxWrapper.setAttribute('data-lbp-description', this.settings.description);
    }
    
    this.lightboxWrapper.setAttribute('data-lbp-mobile-nav', this.settings.mobileNavigationType);

    this.removeFooter();
    this.currentIndex = 0;

    this.waitForActiveSlide().then(() => {
      this.updateCurrentIndex();
      this.buildInnerContainer();
      this.buildHeaderControls();
      this.buildFooter();
      this.setupNavigationObserver();
      this.setupOutsideClickClose();
      this.resetZoom();
      
      LightboxPro.emitEvent(':lightboxOpen', { el: this.section }, this.section);
    });
  }

  buildInnerContainer() {
    if (this.innerContainer) return;
    
    const innerContainer = document.createElement('div');
    innerContainer.className = 'lbp-inner-container';
    
    const children = Array.from(this.lightbox.children);
    children.forEach(child => {
      if (!child.classList.contains('gallery-lightbox-background')) {
        innerContainer.appendChild(child);
      }
    });
    
    this.lightbox.appendChild(innerContainer);
    this.innerContainer = innerContainer;
  }

  removeInnerContainer() {
    if (!this.innerContainer) return;
    
    const children = Array.from(this.innerContainer.children);
    children.forEach(child => {
      this.lightbox.appendChild(child);
    });
    
    this.innerContainer.remove();
    this.innerContainer = null;
  }

  setupOutsideClickClose() {
    this.boundHandlers.outsideClick = (e) => {
      if (!this.lightbox || this.lightbox.dataset.open !== 'true') return;
      if (!this.innerContainer) return;
      
      if (!this.innerContainer.contains(e.target)) {
        this.closeLightbox();
      }
    };
    this.lightbox.addEventListener('click', this.boundHandlers.outsideClick);
  }

  closeLightbox() {
    const closeBtn = this.lightbox?.querySelector('.gallery-lightbox-close-btn');
    if (closeBtn) {
      closeBtn.click();
    }
  }

  waitForActiveSlide() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }

  onLightboxClose() {
    document.body.classList.remove('lbp-lightbox-open');
    
    this.lightboxWrapper.removeAttribute('data-lbp-active');
    
    this.removeNavigationListeners();
    this.removeHeaderControls();
    this.removeFooter();
    this.removeOutsideClickClose();
    this.removeInnerContainer();
    this.removeToast();
    this.resetZoom();
    this.currentIndex = 0;
    this.useManualNavigation = false;
    clearTimeout(this.manualNavTimeout);
    
    LightboxPro.emitEvent(':lightboxClose', { el: this.section }, this.section);
  }

  buildHeaderControls() {
    if (this.headerControls) return;

    const header = this.lightbox.querySelector('.gallery-lightbox-header');
    if (!header) return;

    const closeBtn = header.querySelector('.gallery-lightbox-close-btn');
    
    if (closeBtn && !this.boundHandlers.closeClick) {
      this.boundHandlers.closeClick = () => {
        this.currentIndex = 0;
      };
      closeBtn.addEventListener('click', this.boundHandlers.closeClick);
    }

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'lbp-header-controls';
    controlsContainer.style.display = 'contents';

    if (this.settings.zoomEnabled) {
      const zoomContainer = document.createElement('div');
      zoomContainer.className = 'lbp-zoom-container';

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.className = 'lbp-header-btn lbp-zoom-out-btn';
      zoomOutBtn.setAttribute('aria-label', 'Zoom out');
      zoomOutBtn.innerHTML = LightboxPro.icons.zoomOut;
      zoomOutBtn.addEventListener('click', () => this.handleZoom('out'));
      zoomContainer.appendChild(zoomOutBtn);

      const zoomInBtn = document.createElement('button');
      zoomInBtn.className = 'lbp-header-btn lbp-zoom-in-btn';
      zoomInBtn.setAttribute('aria-label', 'Zoom in');
      zoomInBtn.innerHTML = LightboxPro.icons.zoomIn;
      zoomInBtn.addEventListener('click', () => this.handleZoom('in'));
      zoomContainer.appendChild(zoomInBtn);

      controlsContainer.appendChild(zoomContainer);
    }

    if (this.settings.downloadEnabled) {
      const downloadContainer = document.createElement('div');
      downloadContainer.className = 'lbp-download-container';
      
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'lbp-header-btn lbp-download-btn';
      downloadBtn.setAttribute('aria-label', 'Download');
      downloadBtn.innerHTML = LightboxPro.icons.download;
      downloadBtn.addEventListener('click', (e) => {
        if (this.isMobile()) {
          e.preventDefault();
          e.stopPropagation();
          void this.handleMobileDownloadOriginal();
          return;
        }
        this.toggleDownloadDropdown();
      });
      
      const dropdown = document.createElement('div');
      dropdown.className = 'lbp-download-dropdown';
      
      const formats = ['PNG', 'JPG', 'WEBP', 'PDF'];
      formats.forEach(format => {
        const option = document.createElement('button');
        option.className = 'lbp-download-option';
        option.textContent = format;
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleDownload(format.toLowerCase());
          this.closeDownloadDropdown();
        });
        dropdown.appendChild(option);
      });
      
      downloadContainer.appendChild(downloadBtn);
      downloadContainer.appendChild(dropdown);
      controlsContainer.appendChild(downloadContainer);

      this.boundHandlers.closeDropdown = (e) => {
        const container = this.headerControls?.querySelector('.lbp-download-container');
        if (container && !container.contains(e.target)) {
          this.closeDownloadDropdown();
        }
      };
      document.addEventListener('click', this.boundHandlers.closeDropdown);
    }

    if (this.settings.shareEnabled) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'lbp-header-btn lbp-share-btn';
      shareBtn.setAttribute('aria-label', 'Share');
      shareBtn.innerHTML = LightboxPro.icons.share;
      shareBtn.addEventListener('click', () => this.handleShare());
      controlsContainer.appendChild(shareBtn);
    }

    this.buildToast();

    if (closeBtn) {
      header.insertBefore(controlsContainer, closeBtn);
    } else {
      header.appendChild(controlsContainer);
    }

    this.headerControls = controlsContainer;
    this.updateZoomButtons();
  }

  buildToast() {
    if (this.toast) return;
    
    const toast = document.createElement('div');
    toast.className = 'lbp-toast';
    toast.textContent = 'Link copied!';
    
    this.lightboxWrapper.appendChild(toast);
    this.toast = toast;
  }

  removeToast() {
    if (this.toast) {
      this.toast.remove();
      this.toast = null;
    }
  }

  showToast(message = 'Link copied!') {
    if (!this.toast) return;
    
    this.toast.textContent = message;
    this.toast.dataset.visible = 'true';
    
    setTimeout(() => {
      if (this.toast) {
        this.toast.dataset.visible = 'false';
      }
    }, 2000);
  }

  removeHeaderControls() {
    if (this.headerControls) {
      this.headerControls.remove();
      this.headerControls = null;
    }
    
    if (this.boundHandlers.closeDropdown) {
      document.removeEventListener('click', this.boundHandlers.closeDropdown);
    }
    
    if (this.boundHandlers.closeClick) {
      const closeBtn = this.lightbox?.querySelector('.gallery-lightbox-close-btn');
      if (closeBtn) {
        closeBtn.removeEventListener('click', this.boundHandlers.closeClick);
      }
      this.boundHandlers.closeClick = null;
    }
  }

  removeOutsideClickClose() {
    if (this.boundHandlers.outsideClick) {
      this.lightbox?.removeEventListener('click', this.boundHandlers.outsideClick);
      this.boundHandlers.outsideClick = null;
    }
  }

  removeNavigationListeners() {
    const prevControl = this.lightboxWrapper?.querySelector('.gallery-lightbox-control[data-previous] button');
    const nextControl = this.lightboxWrapper?.querySelector('.gallery-lightbox-control[data-next] button');

    if (prevControl && this.boundHandlers.prevClick) {
      prevControl.removeEventListener('click', this.boundHandlers.prevClick);
    }
    if (nextControl && this.boundHandlers.nextClick) {
      nextControl.removeEventListener('click', this.boundHandlers.nextClick);
    }
    if (this.boundHandlers.keydown) {
      document.removeEventListener('keydown', this.boundHandlers.keydown);
      this.boundHandlers.keydown = null;
    }
    
    const wrapper = this.lightbox?.querySelector('.gallery-lightbox-wrapper');
    if (wrapper) {
      if (this.boundHandlers.preventSwipe) {
        wrapper.removeEventListener('touchstart', this.boundHandlers.preventSwipe, { capture: true });
        wrapper.removeEventListener('touchmove', this.boundHandlers.preventSwipe, { capture: true });
        wrapper.removeEventListener('touchend', this.boundHandlers.preventSwipe, { capture: true });
        this.boundHandlers.preventSwipe = null;
      }
      if (this.boundHandlers.swipeTouchStart) {
        wrapper.removeEventListener('touchstart', this.boundHandlers.swipeTouchStart, { passive: true });
        this.boundHandlers.swipeTouchStart = null;
      }
      if (this.boundHandlers.swipeTouchEnd) {
        wrapper.removeEventListener('touchend', this.boundHandlers.swipeTouchEnd, { passive: true });
        this.boundHandlers.swipeTouchEnd = null;
      }
    }
    
    this.isNavigating = false;
  }

  buildFooter() {
    if (this.footer) return;

    const wrapper = this.lightbox.querySelector('.gallery-lightbox-wrapper');
    if (!wrapper) return;

    const footer = document.createElement('div');
    footer.className = 'lbp-footer';

    const navContainer = document.createElement('div');
    navContainer.className = 'lbp-footer-nav';

    if (this.settings.arrowPosition === 'bottom' && this.totalImages > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'lbp-nav-btn lbp-prev-btn';
      prevBtn.setAttribute('aria-label', 'Previous image');
      prevBtn.innerHTML = LightboxPro.icons.prevArrow;
      prevBtn.addEventListener('click', () => this.navigatePrev());
      navContainer.appendChild(prevBtn);
    }

    this.countEl = document.createElement('span');
    this.countEl.className = 'lbp-image-count';
    this.countEl.textContent = `${this.currentIndex}/${this.totalImages}`;
    this.countEl.style.opacity = '0';
    navContainer.appendChild(this.countEl);
    
    setTimeout(() => {
      if (this.countEl) {
        this.countEl.style.opacity = '';
      }
    }, 1000);

    if (this.settings.arrowPosition === 'bottom' && this.totalImages > 1) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'lbp-nav-btn lbp-next-btn';
      nextBtn.setAttribute('aria-label', 'Next image');
      nextBtn.innerHTML = LightboxPro.icons.nextArrow;
      nextBtn.addEventListener('click', () => this.navigateNext());
      navContainer.appendChild(nextBtn);
    }

    if (this.settings.description) {
      const descEl = document.createElement('div');
      descEl.className = 'lbp-description';
      footer.appendChild(descEl);
    }

    footer.appendChild(navContainer);

    if (this.totalImages > 1 && this.settings.mobileNavigationType === 'arrows') {
      this.buildMobileArrows(wrapper);
    }

    wrapper.after(footer);
    this.footer = footer;
    
    this.updateFooter();
  }

  removeFooter() {
    if (this.footer) {
      this.footer.remove();
      this.footer = null;
    }
    this.countEl = null;
    const existingFooter = this.lightbox?.querySelector('.lbp-footer');
    if (existingFooter) {
      existingFooter.remove();
    }
    this.removeMobileArrows();
  }

  buildMobileArrows(wrapper) {
    this.removeMobileArrows();

    const mobileNav = document.createElement('div');
    mobileNav.className = 'lbp-mobile-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'lbp-mobile-nav-btn lbp-mobile-prev';
    prevBtn.setAttribute('aria-label', 'Previous image');
    prevBtn.innerHTML = LightboxPro.icons.prevArrow;
    prevBtn.addEventListener('click', () => this.navigatePrev());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'lbp-mobile-nav-btn lbp-mobile-next';
    nextBtn.setAttribute('aria-label', 'Next image');
    nextBtn.innerHTML = LightboxPro.icons.nextArrow;
    nextBtn.addEventListener('click', () => this.navigateNext());

    mobileNav.appendChild(prevBtn);
    mobileNav.appendChild(nextBtn);
    wrapper.appendChild(mobileNav);

    this.mobileNav = mobileNav;
  }

  removeMobileArrows() {
    if (this.mobileNav) {
      this.mobileNav.remove();
      this.mobileNav = null;
    }
    const existingMobileNav = this.lightbox?.querySelector('.lbp-mobile-nav');
    if (existingMobileNav) {
      existingMobileNav.remove();
    }
  }

  updateCurrentIndex() {
    const activeSlide = this.lightbox.querySelector('.gallery-lightbox-item[data-active="true"]');
    if (activeSlide) {
      const slideUrl = activeSlide.dataset.slideUrl;
      if (slideUrl && this.slideUrlToIndex[slideUrl]) {
        this.currentIndex = this.slideUrlToIndex[slideUrl];
      } else {
        const lbpIndex = activeSlide.getAttribute('data-lbp-index');
        if (lbpIndex) {
          this.currentIndex = parseInt(lbpIndex, 10);
        }
      }
    }
    
    if (this.currentIndex === 0 && this.totalImages > 0) {
      this.currentIndex = 1;
    }
  }

  setupNavigationObserver() {
    const list = this.lightbox.querySelector('.gallery-lightbox-list');
    if (!list) return;

    this.isNavigating = false;
    this.lastActiveIndex = this.currentIndex;

    this.useManualNavigation = false;

    const observer = new MutationObserver(() => {
      this.resetZoom();
      
      if (this.useManualNavigation) {
        return;
      }
      
      this.updateCurrentIndex();
      this.updateFooter();
    });

    observer.observe(list, {
      attributes: true,
      attributeFilter: ['data-active'],
      subtree: true
    });

    this.observers.push(observer);


    const navigate = (direction) => {
      if (direction === 'prev') {
        this.currentIndex = this.currentIndex > 1 ? this.currentIndex - 1 : this.totalImages;
      } else {
        this.currentIndex = this.currentIndex < this.totalImages ? this.currentIndex + 1 : 1;
      }
      
      this.updateCountDisplay();
      
      this.useManualNavigation = true;
      clearTimeout(this.manualNavTimeout);
      this.manualNavTimeout = setTimeout(() => {
        this.useManualNavigation = false;
      }, 500);
    };

    const prevControl = this.lightboxWrapper.querySelector('.gallery-lightbox-control[data-previous] button');
    const nextControl = this.lightboxWrapper.querySelector('.gallery-lightbox-control[data-next] button');

    if (prevControl) {
      this.boundHandlers.prevClick = () => navigate('prev');
      prevControl.addEventListener('click', this.boundHandlers.prevClick);
    }

    if (nextControl) {
      this.boundHandlers.nextClick = () => navigate('next');
      nextControl.addEventListener('click', this.boundHandlers.nextClick);
    }

    this.boundHandlers.keydown = (e) => {
      if (this.lightbox.dataset.open !== 'true') return;
      if (e.repeat) return;
      
      if (e.key === 'ArrowLeft') {
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        navigate('next');
      }
    };
    document.addEventListener('keydown', this.boundHandlers.keydown);

    if (this.settings.mobileNavigationType === 'arrows') {
      this.disableNativeSwipe();
    } else {
      this.setupSwipeDetection();
    }
  }

  setupSwipeDetection() {
    const wrapper = this.lightbox.querySelector('.gallery-lightbox-wrapper');
    if (!wrapper) return;

    let startX = 0;
    let startY = 0;

    this.boundHandlers.swipeTouchStart = (e) => {
      if (e.touches && e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    this.boundHandlers.swipeTouchEnd = (e) => {
      if (e.changedTouches && e.changedTouches.length === 1) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = Math.abs(endX - startX);
        const diffY = Math.abs(endY - startY);
        
        if (diffX > 30 && diffX > diffY) {
          setTimeout(() => {
            this.updateCurrentIndex();
            this.updateFooter();
          }, 350);
        }
      }
    };

    wrapper.addEventListener('touchstart', this.boundHandlers.swipeTouchStart, { passive: true });
    wrapper.addEventListener('touchend', this.boundHandlers.swipeTouchEnd, { passive: true });
  }

  disableNativeSwipe() {
    const wrapper = this.lightbox.querySelector('.gallery-lightbox-wrapper');
    if (!wrapper) return;

    this.boundHandlers.preventSwipe = (e) => {
      if (e.touches && e.touches.length === 1) {
        e.stopPropagation();
      }
    };

    wrapper.addEventListener('touchstart', this.boundHandlers.preventSwipe, { capture: true });
    wrapper.addEventListener('touchmove', this.boundHandlers.preventSwipe, { capture: true });
    wrapper.addEventListener('touchend', this.boundHandlers.preventSwipe, { capture: true });
  }

  updateCountDisplay() {
    if (this.countEl) {
      this.countEl.textContent = `${this.currentIndex}/${this.totalImages}`;
    }
  }

  updateFooter() {
    if (!this.footer) return;

    this.updateCountDisplay();

    if (this.settings.description) {
      const descEl = this.footer.querySelector('.lbp-description');
      if (descEl) {
        const imageInfo = this.imageData.find(img => img.index === this.currentIndex);
        descEl.textContent = imageInfo?.caption || '';
        descEl.style.display = imageInfo?.caption ? 'block' : 'none';
      }
    }
  }

  navigatePrev() {
    const prevBtn = this.lightboxWrapper.querySelector('.gallery-lightbox-control[data-previous] button');
    if (prevBtn) {
      prevBtn.click();
    }
  }

  navigateNext() {
    const nextBtn = this.lightboxWrapper.querySelector('.gallery-lightbox-control[data-next] button');
    if (nextBtn) {
      nextBtn.click();
    }
  }

  toggleDownloadDropdown() {
    const container = this.headerControls?.querySelector('.lbp-download-container');
    if (container) {
      const isOpen = container.dataset.open === 'true';
      container.dataset.open = !isOpen;
    }
  }

  closeDownloadDropdown() {
    const container = this.headerControls?.querySelector('.lbp-download-container');
    if (container) {
      container.dataset.open = 'false';
    }
  }

  extensionFromMime(mime) {
    if (!mime) return '';
    const m = mime.split(';')[0].trim().toLowerCase();
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
      'image/avif': 'avif'
    };
    return map[m] || '';
  }

  extensionFromUrl(url) {
    try {
      const pathname = new URL(url, window.location.href).pathname;
      const match = pathname.match(/\.([a-z0-9]+)$/i);
      return match ? match[1].toLowerCase() : '';
    } catch {
      return '';
    }
  }

  async handleMobileDownloadOriginal() {
    const imageInfo = this.imageData.find(img => img.index === this.currentIndex);
    if (!imageInfo) return;

    const url = imageInfo.originalSrc;
    const fallbackBase = `image-${this.currentIndex}`;

    let blob;
    let contentTypeHeader = '';
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      contentTypeHeader = res.headers.get('content-type') || '';
      blob = await res.blob();
    } catch (error) {
      console.error(`[${LightboxPro.pluginName}] Original image fetch failed:`, error);
      this.showToast('Could not load image');
      return;
    }

    let mime = '';
    if (blob.type && blob.type !== 'application/octet-stream') {
      mime = blob.type.split(';')[0].trim();
    } else if (contentTypeHeader) {
      mime = contentTypeHeader.split(';')[0].trim();
    }
    if (!mime || mime === 'application/octet-stream') {
      const extUrl = this.extensionFromUrl(url);
      const mimeFromExt = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        avif: 'image/avif'
      }[extUrl] || 'image/jpeg';
      mime = mimeFromExt;
    }

    const ext =
      this.extensionFromMime(mime) ||
      this.extensionFromUrl(url) ||
      'jpg';
    const fileName = `${fallbackBase}.${ext}`;
    const file = new File([blob], fileName, { type: mime });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn(`[${LightboxPro.pluginName}] Share failed, falling back to download:`, err);
      }
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }

  async handleDownload(format) {
    const imageInfo = this.imageData.find(img => img.index === this.currentIndex);
    if (!imageInfo) return;

    const originalSrc = imageInfo.originalSrc;
    const fileName = `image-${this.currentIndex}`;

    try {
      if (format === 'png') {
        await this.downloadConverted(originalSrc, fileName, 'image/png', 'png');
      } else if (format === 'jpg') {
        await this.downloadConverted(originalSrc, fileName, 'image/jpeg', 'jpg');
      } else if (format === 'webp') {
        await this.downloadConverted(originalSrc, fileName, 'image/webp', 'webp');
      } else if (format === 'pdf') {
        await this.downloadAsPdf(originalSrc, fileName);
      }
    } catch (error) {
      console.error(`[${LightboxPro.pluginName}] Download failed:`, error);
      this.downloadConverted(originalSrc, fileName, 'image/jpeg', 'jpg');
    }
  }

  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
  }

  async downloadConverted(src, fileName, mimeType, extension) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise((resolve, reject) => {
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            resolve();
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        }, mimeType, 0.95);
      };
      
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });
  }

  async downloadAsPdf(src, fileName) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${fileName}</title>
              <style>
                @page { margin: 0; }
                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${imgData}" alt="${fileName}">
              <script>
                window.onload = function() {
                  setTimeout(function() {
                    window.print();
                  }, 500);
                };
              </script>
            </body>
            </html>
          `);
          printWindow.document.close();
          resolve();
        } else {
          reject(new Error('Could not open print window'));
        }
      };
      
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });
  }

  handleShare() {
    const imageInfo = this.imageData.find(img => img.index === this.currentIndex);
    const baseUrl = window.location.href.split('?')[0];
    const shareUrl = imageInfo?.slideUrl 
      ? `${baseUrl}?itemId=${imageInfo.slideUrl}` 
      : baseUrl;

    navigator.clipboard.writeText(shareUrl).then(() => {
      this.showToast('Link copied!');
    }).catch((error) => {
      console.error(`[${LightboxPro.pluginName}] Copy failed:`, error);
    });
  }

  handleZoom(direction) {
    if (direction === 'in' && this.zoomLevel < this.maxZoom) {
      this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
    } else if (direction === 'out' && this.zoomLevel > this.minZoom) {
      this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
    }

    this.applyZoom();
    this.updateZoomButtons();
  }

  applyZoom() {
    const activeItem = this.lightbox.querySelector('.gallery-lightbox-item[data-active="true"]');
    if (activeItem) {
      activeItem.style.setProperty('--lbp-zoom-level', this.zoomLevel);
    }
  }

  resetZoom() {
    this.zoomLevel = 1;
    
    const items = this.lightbox.querySelectorAll('.gallery-lightbox-item');
    items.forEach(item => {
      item.style.setProperty('--lbp-zoom-level', 1);
    });
    
    this.updateZoomButtons();
  }

  updateZoomButtons() {
    if (!this.headerControls) return;

    const zoomInBtn = this.headerControls.querySelector('.lbp-zoom-in-btn');
    const zoomOutBtn = this.headerControls.querySelector('.lbp-zoom-out-btn');

    if (zoomInBtn) {
      zoomInBtn.dataset.disabled = this.zoomLevel >= this.maxZoom;
    }
    if (zoomOutBtn) {
      zoomOutBtn.dataset.disabled = this.zoomLevel <= this.minZoom;
    }
  }

  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];

    this.removeNavigationListeners();
    this.removeHeaderControls();
    this.removeFooter();
    
    document.body.classList.remove('lbp-lightbox-open');
    
    if (this.lightboxWrapper) {
      this.lightboxWrapper.removeAttribute('data-lbp-active');
      this.lightboxWrapper.removeAttribute('data-lbp-zoom');
      this.lightboxWrapper.removeAttribute('data-lbp-download');
      this.lightboxWrapper.removeAttribute('data-lbp-share');
      this.lightboxWrapper.removeAttribute('data-lbp-arrows');
      this.lightboxWrapper.removeAttribute('data-lbp-custom-arrows');
      this.lightboxWrapper.removeAttribute('data-lbp-description');
      this.lightboxWrapper.removeAttribute('data-lbp-mobile-nav');
    }

    this.section.removeAttribute('data-wm-plugin');
    
    const galleryItems = this.section.querySelectorAll('[data-lbp-index]');
    galleryItems.forEach(item => item.removeAttribute('data-lbp-index'));

    LightboxPro.emitEvent(':destroy', { el: this.section }, this.section);
  }
}

(function() {
  const pluginName = 'lightbox-pro';
  const instances = [];

  function initPlugin() {
    const sections = document.querySelectorAll(`[id*="${pluginName}"]`);
    
    sections.forEach(section => {
      if (!section.classList.contains('gallery-section')) return;
      
      const gallery = section.querySelector('[data-lightbox="true"]');
      if (!gallery) return;

      const sectionId = section.id;
      const settings = window.lightboxProSettings?.[sectionId] || {};
      
      const existingInstance = instances.find(inst => inst.section === section);
      if (existingInstance) return;

      const instance = new LightboxPro(section, settings);
      instances.push(instance);
    });
  }

  initPlugin();

  if (window.top !== window.self) {
    const observer = new MutationObserver((mutations) => {
      const editModeActive = document.body.classList.contains('sqs-edit-mode-active');
      
      if (editModeActive) {
        instances.forEach(instance => {
          if (instance && typeof instance.destroy === 'function') {
            instance.destroy();
          }
        });
        instances.length = 0;
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    const reinitObserver = new MutationObserver((mutations) => {
      const editModeActive = document.body.classList.contains('sqs-edit-mode-active');
      
      if (!editModeActive && instances.length === 0) {
        setTimeout(initPlugin, 100);
      }
    });

    reinitObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  window.LightboxPro = LightboxPro;
  window.lightboxProInstances = instances;
})();

