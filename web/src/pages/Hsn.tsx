import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, errorMessage, type Hsn } from '../api'

export function HsnPage() {
  const queryClient = useQueryClient()
  const hsn = useQuery({ queryKey: ['hsn'], queryFn: async () => (await api.get<Hsn[]>('/api/hsn')).data })
  const [open, setOpen] = useState<Hsn | null | undefined>(undefined)
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [gstRate, setGstRate] = useState('5.00')
  const save = useMutation({
    mutationFn: async () => {
      const body = { code, description, gstRate }
      if (open?.id) return (await api.put(`/api/hsn/${open.id}`, body)).data
      return (await api.post('/api/hsn', body)).data
    },
    onSuccess: async () => {
      setOpen(undefined)
      await queryClient.invalidateQueries({ queryKey: ['hsn'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })

  function edit(row?: Hsn) {
    setOpen(row ?? null)
    setCode(row?.code ?? '')
    setDescription(row?.description ?? '')
    setGstRate(row?.gstRate ?? '5.00')
    save.reset()
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h5">HSN / GST</Typography>
          <Typography color="text.secondary">Invoice tax uses the rate stored on the HSN code.</Typography>
        </div>
        <Button variant="contained" onClick={() => edit()}>Add HSN</Button>
      </Stack>
      {hsn.isLoading && <Typography>Loading HSN codes…</Typography>}
      {hsn.isError && <Alert severity="error">{errorMessage(hsn.error)}</Alert>}
      {hsn.data && (
        <Paper sx={{ overflow: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>HSN</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">GST %</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {hsn.data.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.code}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell align="right">{row.gstRate}</TableCell>
                  <TableCell align="right"><Button onClick={() => edit(row)}>Edit</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Dialog open={open !== undefined} onClose={() => setOpen(undefined)} fullWidth maxWidth="xs">
        <DialogTitle>{open ? 'Edit HSN' : 'New HSN'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
            <TextField label="HSN code" value={code} onChange={(event) => setCode(event.target.value)} />
            <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <TextField label="GST %" value={gstRate} onChange={(event) => setGstRate(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(undefined)}>Cancel</Button>
          <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
