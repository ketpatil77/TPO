window.setupStaffAvatar = function setupStaffAvatar({ buttonId, inputId, imageId, endpoint, onError }) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    const image = document.getElementById(imageId);
    if (!button || !input || !image) return;
    const showError = onError || (message => window.alert(message));

    const refreshAvatar = async (allowRetry = true) => {
        try {
            const response = await fetch(endpoint, { cache: 'no-store' });
            if (!response.ok) return;
            const result = await response.json();
            if (result.data?.url) {
                setStaffAvatar(button, image, result.data.url, allowRetry ? () => window.setTimeout(() => refreshAvatar(false), 250) : null);
            } else {
                clearStaffAvatar(button, image);
            }
        } catch (_) { clearStaffAvatar(button, image); }
    };

    button.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png'].includes(file.type)) return showError('Use JPG, JPEG, or PNG only.');
        if (file.size >= 1024 * 1024) return showError('Profile picture must be under 1 MB.');
        const form = new FormData();
        form.append('avatar', file);
        button.disabled = true;
        try {
            const response = await fetch(endpoint, { method: 'POST', body: form });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error?.message || result.error || 'Upload failed.');
            setStaffAvatar(button, image, result.data.url, () => window.setTimeout(() => refreshAvatar(false), 250));
        } catch (error) { showError(error.message); }
        finally { button.disabled = false; input.value = ''; }
    });

    refreshAvatar();
};

function clearStaffAvatar(button, image) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    button.classList.remove('has-image');
}

function setStaffAvatar(button, image, url, retry) {
    clearStaffAvatar(button, image);
    image.onload = () => {
        image.onload = null;
        image.onerror = null;
        button.classList.add('has-image');
    };
    image.onerror = () => {
        clearStaffAvatar(button, image);
        if (retry) retry();
    };
    image.src = url;
}
