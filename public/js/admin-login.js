document.addEventListener('DOMContentLoaded', () => {
    verifyAdminSession();

    const loginForm = document.getElementById('adminLoginForm');
    loginForm.addEventListener('submit', handleAdminLogin);
});

async function handleAdminLogin(e) {
    e.preventDefault();
    const pwdInput = document.getElementById('password');
    const email = document.getElementById('email').value.trim();
    const submitBtn = document.getElementById('submitBtn');

    const password = pwdInput.value.trim();
    if (!password) {
        showAlert('Please enter the admin password.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Verifying security key...';
    hideAlert();

    try {
        const response = await fetch('/api/admin/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Admin login verified! Opening workspace...', 'success');
            setTimeout(() => {
                window.location.href = '/admin/dashboard';
            }, 600);
        } else {
            showAlert(apiError(data));
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Unlock Admin Dashboard →';
        }
    } catch (err) {
        console.error('Admin login error:', err);
        showAlert('Network error or server unavailable.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Unlock Admin Dashboard →';
    }
}

async function verifyAdminSession() {
    try {
        const res = await fetch('/api/admin/auth/me');
        const data = await res.json();
        if (data.success) {
            window.location.href = '/admin/dashboard';
        }
    } catch (err) {
        // No active cookie session.
    }
}

function showAlert(msg) {
    const alertBox = document.getElementById('alertBox');
    alertBox.style.display = 'block';
    alertBox.innerHTML = `
        <div style="padding: 0.75rem 1rem; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-size: 0.875rem;">
            ⚠️ ${msg}
        </div>
    `;
}

function hideAlert() {
    const alertBox = document.getElementById('alertBox');
    alertBox.style.display = 'none';
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> ${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
