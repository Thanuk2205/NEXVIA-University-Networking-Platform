import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await login(form.email, form.password);
      const dest = {
        student: '/dashboard/student',
        alumni: '/dashboard/student',
        company: '/dashboard/company',
        faculty: '/dashboard/faculty',
        admin: '/dashboard/admin',
      }[user.role] || '/';
      navigate(dest);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h2>Welcome back</h2>
        {error && <div className="error">{error}</div>}
        <label>Email</label>
        <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label>Password</label>
        <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit">Log In</button>
        <p className="muted">No account? <Link to="/register">Register here</Link></p>
      </form>
    </div>
  );
}
