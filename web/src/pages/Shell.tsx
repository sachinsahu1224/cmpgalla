import BusinessIcon from '@mui/icons-material/Business'
import GrainIcon from '@mui/icons-material/Grain'
import InventoryIcon from '@mui/icons-material/Inventory2'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import CategoryIcon from '@mui/icons-material/Category'
import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'

const links = [
  { to: '/', label: 'Dashboard', icon: <GrainIcon /> },
  { to: '/company', label: 'Company', icon: <BusinessIcon /> },
  { to: '/customers', label: 'Customers', icon: <PeopleIcon /> },
  { to: '/products', label: 'Products', icon: <InventoryIcon /> },
  { to: '/hsn', label: 'HSN / GST', icon: <CategoryIcon /> },
  { to: '/invoices', label: 'Sales invoices', icon: <ReceiptLongIcon /> },
]

export function Shell() {
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('md'))
  const [open, setOpen] = useState(false)
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  const drawer = (
    <Box sx={{ width: 240 }}>
      <Box sx={{ px: 2, py: 2.5 }}>
        <Typography variant="overline" color="primary">Abhishek Traders</Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Billing</Typography>
      </Box>
      <List>
        {links.map((link) => (
          <ListItemButton
            key={link.to}
            component={NavLink}
            to={link.to}
            end={link.to === '/'}
            onClick={() => setOpen(false)}
            sx={{ '&.active': { bgcolor: 'rgba(27,77,62,0.1)', color: 'primary.main' } }}
          >
            <ListItemIcon sx={{ color: 'inherit' }}>{link.icon}</ListItemIcon>
            <ListItemText primary={link.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', zIndex: (mui) => mui.zIndex.drawer + 1 }}>
        <Toolbar>
          {!wide && (
            <IconButton edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
          )}
          <Typography sx={{ flexGrow: 1, fontWeight: 700 }}>GST Billing</Typography>
          <Typography color="text.secondary" sx={{ mr: 2 }}>{session?.fullName}</Typography>
          <IconButton aria-label="Sign out" onClick={() => { logout(); navigate('/') }}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer variant={wide ? 'permanent' : 'temporary'} open={wide || open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: 240, boxSizing: 'border-box', bgcolor: 'background.paper' } }}>
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, mt: 8, ml: wide ? '240px' : 0 }}>
        <Outlet />
      </Box>
    </Box>
  )
}
