/* Global footer reveal, driven by the central editor's scroll position. */
(function () {
    'use strict';
    const root = document.documentElement;
    const center = document.getElementById('workspace-content');
    const spacer = document.querySelector('.footer-scroll-space');
    const footer = document.querySelector('.site-footer');
    const desktop = matchMedia('(min-width:1241px)');
    let queued = false;

    function update() {
        queued = false;
        if (!desktop.matches) {
            root.style.removeProperty('--footer-reveal');
            footer.inert = false;
            footer.removeAttribute('aria-hidden');
            return;
        }
        const height = footer.getBoundingClientRect().height;
        const visible = Math.min(height, Math.max(0, center.getBoundingClientRect().bottom - spacer.getBoundingClientRect().top));
        root.style.setProperty('--footer-reveal', visible + 'px');
        footer.inert = visible < 1;
        footer.setAttribute('aria-hidden', String(visible < 1));
    }

    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    }

    function measure() {
        root.style.setProperty('--global-footer-height', footer.getBoundingClientRect().height + 'px');
        schedule();
    }

    center.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    desktop.addEventListener('change', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    observer.observe(center.querySelector('.preview-panel'));
    footer.addEventListener('wheel', event => {
        if (!desktop.matches || event.ctrlKey || !event.deltaY) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? center.clientHeight : 1;
        center.scrollBy({ top: event.deltaY * unit });
    }, { passive: false });
    measure();
})();
