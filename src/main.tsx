import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthStoreProvider } from './store/AuthStore'
import { RequireAuth } from './components/RequireAuth'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Find from './pages/Find'
import SupplierProfile from './pages/SupplierProfile'
import UpdateResults from './pages/UpdateResults'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthStoreProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <App />
              </RequireAuth>
            }
          >
            <Route index element={<Overview />} />
            <Route path="find" element={<Find />} />
            <Route path="profile" element={<SupplierProfile />} />
            <Route path="profile/:id" element={<SupplierProfile />} />
            <Route path="update-results" element={<UpdateResults />} />
          </Route>
        </Routes>
      </AuthStoreProvider>
    </BrowserRouter>
  </StrictMode>,
)
