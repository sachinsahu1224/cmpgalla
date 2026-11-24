import { Alert, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { api, errorMessage, type Summary } from '../api'

export function HomePage() {
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: async () => (await api.get<Summary>('/api/summary')).data,
  })

  if (summary.isLoading) return <CircularProgress />
  if (summary.isError) return <Alert severity="error">{errorMessage(summary.error)}</Alert>

  const data = summary.data!
  const cards = [
    ['Company', data.companyName],
    ['GSTIN', data.gstin],
    ['Portal calls', data.integrationMode],
    ['Active customers', String(data.customers)],
    ['Active products', String(data.products)],
    ['HSN codes', String(data.hsnCodes)],
    ['Sales invoices', String(data.invoices)],
  ]

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h5">Dashboard</Typography>
        <Typography color="text.secondary">Live counts from the company database.</Typography>
      </div>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {cards.map(([label, value]) => (
          <Card key={label} sx={{ minWidth: 220, flex: '1 1 220px' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">{label}</Typography>
              <Typography variant="h6">{value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}
