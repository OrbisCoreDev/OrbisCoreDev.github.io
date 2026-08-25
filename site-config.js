/*
 * Deployment configuration
 *
 * Update only this file when moving the work page to another Firebase project.
 * Firebase web API keys are identifiers, not secrets; keep
 * Firestore/Realtime Database rules restrictive.
 */
(function configureOrbisSite() {
    const config = {
        firebase: {
            apiKey: "AIzaSyAhwElNSj9uGqJc4d3-FGvb_sXLFVumTQM",
            authDomain: "orbiscore-workspace.firebaseapp.com",
            projectId: "orbiscore-workspace",
            storageBucket: "orbiscore-workspace.firebasestorage.app",
            messagingSenderId: "7475549841",
            appId: "1:7475549841:web:86be729e429f436bcf9130",
            measurementId: "G-Y7TELZQSRB",
        }
    };

    window.ORBIS_SITE_CONFIG = Object.freeze(config);

    document.querySelectorAll('[data-site-page]').forEach((link) => {
        const pageUrl = config.pages[link.dataset.sitePage];
        if (pageUrl) link.setAttribute('href', pageUrl);
    });
}());
