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
    submitBtn.textContent = 'Verifying credentials...';
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
            submitBtn.textContent = 'Sign in to admin workspace';
        }
    } catch (err) {
        console.error('Admin login error:', err);
        showAlert('Network error or server unavailable.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in to admin workspace';
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
    alertBox.className = 'form-alert';
    alertBox.textContent = msg;
}

function hideAlert() {
    const alertBox = document.getElementById('alertBox');
    alertBox.style.display = 'none';
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
