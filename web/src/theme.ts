import { createTheme } from '@mui/material'

export const theme = createTheme({
  palette: {
    primary: { main: '#1b4d3e' },
    secondary: { main: '#9a3412' },
    background: { default: '#f3f0e8', paper: '#fffdf8' },
    text: { primary: '#1c1917' },
  },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
})
