import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, errorMessage, inr, type Customer, type Product } from '../api'

type Line = {
  productId: number | null
  description: string
  hsnCode: string
  bags: string
  quantity: string
  quantityUnit: 'KG' | 'QTL'
  rate: string
  rateUnit: 'KG' | 'QTL'
  discount: string
  shortageQty: string
  bardanaAmount: string
}

type PortalRecord = { id: number; status: string; irn?: string | null; ewayNo?: string | null; portalMessage?: string | null; ackNo?: string | null; ackDate?: string | null }

type Invoice = {
  id: number
  number: string
  invoiceDate: string
  status: string
  customerId: number
  placeOfSupply: string
  buyerName: string
  taxable: string
  cgst: string
  sgst: string
  igst: string
  roundOff: string
  total: string
  words: string
  integrationMode: string
  einvoiceState: string | null
  ewayState: string | null
  vehicleNo: string | null
  transporterName: string | null
  distanceKm: number | null
  lrNumber: string | null
  transportMode: string
  einvoice: PortalRecord | null
  eway: PortalRecord | null
  items: Line[]
}

const blankLine = (): Line => ({
  productId: null, description: '', hsnCode: '', bags: '0', quantity: '', quantityUnit: 'QTL', rate: '', rateUnit: 'QTL', discount: '0', shortageQty: '0', bardanaAmount: '0',
})

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: async () => (await api.get<Invoice[]>('/api/invoices')).data })
  const customers = useQuery({ queryKey: ['customers', ''], queryFn: async () => (await api.get<Customer[]>('/api/customers')).data })
  const products = useQuery({ queryKey: ['products', ''], queryFn: async () => (await api.get<Product[]>('/api/products')).data })
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [number, setNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('2025-11-23')
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [placeOfSupply, setPlaceOfSupply] = useState('23')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [vehicleNo, setVehicleNo] = useState('')
  const [transporterName, setTransporterName] = useState('')
  const [distanceKm, setDistanceKm] = useState('0')
  const [lrNumber, setLrNumber] = useState('')
  const [transportMode, setTransportMode] = useState<'ROAD' | 'RAIL' | 'AIR' | 'SHIP'>('ROAD')
  const [notice, setNotice] = useState('')
  const [portal, setPortal] = useState<Invoice | null>(null)

  const payload = () => ({
    number, invoiceDate, customerId: Number(customerId), placeOfSupply, lines, vehicleNo, transporterName, transportMode,
    distanceKm: distanceKm === '' ? 0 : Number(distanceKm), lrNumber,
  })
  const preview = useQuery({
    queryKey: ['invoice-preview', number, invoiceDate, customerId, placeOfSupply, lines, vehicleNo, distanceKm],
    queryFn: async () => (await api.post('/api/invoices/preview', payload())).data,
    enabled: Boolean(customerId) && lines.some((line) => line.quantity && line.rate && line.hsnCode),
    retry: false,
  })

  useEffect(() => {
    if (!currentId || !invoices.data) return
    const invoice = invoices.data.find((row) => row.id === currentId)
    if (!invoice) return
    setPortal(invoice)
    setNumber(invoice.number)
    setInvoiceDate(invoice.invoiceDate)
    setCustomerId(invoice.customerId)
    setPlaceOfSupply(invoice.placeOfSupply)
    setLines(invoice.items.length ? invoice.items.map((item) => ({ ...blankLine(), ...item, bardanaAmount: (item as Line & { bardana?: string }).bardana ?? item.bardanaAmount ?? '0' })) : [blankLine()])
    setVehicleNo(invoice.vehicleNo ?? '')
    setTransporterName(invoice.transporterName ?? '')
    setDistanceKm(String(invoice.distanceKm ?? 0))
    setLrNumber(invoice.lrNumber ?? '')
    setTransportMode((invoice.transportMode as 'ROAD') || 'ROAD')
  }, [currentId, invoices.data])

  const save = useMutation({
    mutationFn: async () => {
      if (currentId && portal?.status === 'DRAFT') return (await api.put<Invoice>(`/api/invoices/${currentId}`, payload())).data
      if (currentId) return portal
      return (await api.post<Invoice>('/api/invoices', payload())).data
    },
    onSuccess: async (invoice) => {
      if (!invoice) return
      setCurrentId(invoice.id)
      setNotice(`Invoice ${invoice.number} saved. Total ${inr(invoice.total)}.`)
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    },
  })
  const finalise = useMutation({
    mutationFn: async () => {
      const saved = await save.mutateAsync()
      return (await api.post<Invoice>(`/api/invoices/${saved!.id}/finalise`)).data
    },
    onSuccess: async (invoice) => {
      setPortal(invoice)
      setNotice(`Invoice ${invoice.number} is final.`)
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  async function portalCall(path: string, body: object = {}) {
    if (!currentId) return
    try {
      const response = await api.post(`/api/invoices/${currentId}/${path}`, body)
      setNotice(response.data.portalMessage || response.data.status)
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  async function downloadPdf() {
    if (!currentId) return
    const response = await api.get(`/api/invoices/${currentId}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    window.open(url)
  }

  function chooseProduct(index: number, productId: number) {
    const product = products.data?.find((row) => row.id === productId)
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? {
      ...line,
      productId,
      description: product?.name ?? line.description,
      hsnCode: product?.hsn?.code ?? line.hsnCode,
      quantityUnit: product?.unit === 'KG' ? 'KG' : 'QTL',
      rateUnit: product?.unit === 'KG' ? 'KG' : 'QTL',
    } : line))
  }

  const locked = portal?.status === 'FINAL' || portal?.status === 'CANCELLED'
  const previewData = preview.data as { taxable: string; cgst: string; sgst: string; igst: string; roundOff: string; total: string; words: string; integrationMode: string } | undefined

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h5">Sales invoices</Typography>
          <Typography color="text.secondary">Tax is calculated on the server. One quintal is 100 kg.</Typography>
        </div>
        <Button variant="contained" onClick={() => { setCurrentId(null); setPortal(null); setNumber(''); setLines([blankLine()]); setNotice('') }}>New invoice</Button>
      </Stack>
      {(previewData?.integrationMode === 'MOCK' || portal?.integrationMode === 'MOCK' || portal?.einvoice?.status === 'MOCK' || portal?.eway?.status === 'MOCK') && (
        <Alert severity="warning">MOCK / TEST ONLY. No IRN or government QR is created in mock mode.</Alert>
      )}
      {notice && <Alert severity="info">{notice}</Alert>}
      {save.isError && <Alert severity="error">{errorMessage(save.error)}</Alert>}
      {preview.isError && <Alert severity="warning">{errorMessage(preview.error)}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField label="Invoice number" value={number} onChange={(event) => setNumber(event.target.value)} disabled={locked} helperText="Leave blank for the next financial-year number" />
        <TextField label="Date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} disabled={locked} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select label="Customer" value={customerId} onChange={(event) => {
          const id = Number(event.target.value)
          setCustomerId(id)
          const customer = customers.data?.find((row) => row.id === id)
          if (customer) setPlaceOfSupply(customer.stateCode)
        }} disabled={locked}>
          {(customers.data ?? []).map((customer) => <MenuItem key={customer.id} value={customer.id}>{customer.name}</MenuItem>)}
        </TextField>
        <TextField label="Place of supply" value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} disabled={locked} />
      </Stack>
      {lines.map((line, index) => (
        <Paper key={index} sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField select label="Product" value={line.productId ?? ''} onChange={(event) => chooseProduct(index, Number(event.target.value))} disabled={locked} sx={{ minWidth: 180 }}>
                {(products.data ?? []).map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
              </TextField>
              <TextField label="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} disabled={locked} />
              <TextField label="HSN" value={line.hsnCode} onChange={(event) => updateLine(index, { hsnCode: event.target.value })} disabled={locked} />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Bags" value={line.bags} onChange={(event) => updateLine(index, { bags: event.target.value })} disabled={locked} />
              <TextField label="Quantity" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} disabled={locked} />
              <TextField select label="Qty unit" value={line.quantityUnit} onChange={(event) => updateLine(index, { quantityUnit: event.target.value as Line['quantityUnit'] })} disabled={locked}>
                <MenuItem value="QTL">Quintal</MenuItem>
                <MenuItem value="KG">KG</MenuItem>
              </TextField>
              <TextField label="Rate" value={line.rate} onChange={(event) => updateLine(index, { rate: event.target.value })} disabled={locked} />
              <TextField select label="Rate unit" value={line.rateUnit} onChange={(event) => updateLine(index, { rateUnit: event.target.value as Line['rateUnit'] })} disabled={locked}>
                <MenuItem value="QTL">Per quintal</MenuItem>
                <MenuItem value="KG">Per kg</MenuItem>
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Shortage" value={line.shortageQty} onChange={(event) => updateLine(index, { shortageQty: event.target.value })} disabled={locked} />
              <TextField label="Discount" value={line.discount} onChange={(event) => updateLine(index, { discount: event.target.value })} disabled={locked} />
              <TextField label="Bardana amount" value={line.bardanaAmount} onChange={(event) => updateLine(index, { bardanaAmount: event.target.value })} disabled={locked} helperText="Used when bardana mode is flat" />
            </Stack>
          </Stack>
        </Paper>
      ))}
      {!locked && <Button onClick={() => setLines((current) => [...current, blankLine()])}>Add line</Button>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField label="Transporter" value={transporterName} onChange={(event) => setTransporterName(event.target.value)} disabled={locked} />
        <TextField label="Vehicle" value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} disabled={locked} />
        <TextField select label="Mode" value={transportMode} onChange={(event) => setTransportMode(event.target.value as 'ROAD')} disabled={locked}>
          <MenuItem value="ROAD">Road</MenuItem>
          <MenuItem value="RAIL">Rail</MenuItem>
          <MenuItem value="AIR">Air</MenuItem>
          <MenuItem value="SHIP">Ship</MenuItem>
        </TextField>
        <TextField label="Distance km" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} disabled={locked} helperText="0 lets the portal calculate from PIN codes" />
        <TextField label="LR / bilty" value={lrNumber} onChange={(event) => setLrNumber(event.target.value)} disabled={locked} />
      </Stack>
      {previewData && (
        <Paper sx={{ p: 2 }}>
          <Typography>Taxable {inr(previewData.taxable)} · CGST {inr(previewData.cgst)} · SGST {inr(previewData.sgst)} · IGST {inr(previewData.igst)}</Typography>
          <Typography>Round off {inr(previewData.roundOff)} · Total {inr(previewData.total)}</Typography>
          <Typography color="text.secondary">{previewData.words}</Typography>
        </Paper>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {!locked && <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()}>Save draft</Button>}
        {!locked && <Button variant="contained" color="secondary" disabled={finalise.isPending} onClick={() => finalise.mutate()}>Finalise</Button>}
        {currentId && <Button onClick={downloadPdf}>PDF</Button>}
        {portal?.status === 'FINAL' && <Button onClick={() => portalCall('einvoice')}>e-Invoice</Button>}
        {portal?.status === 'FINAL' && <Button onClick={() => portalCall('eway')}>e-Way bill</Button>}
      </Stack>
      {portal?.einvoice && <Alert severity={portal.einvoice.status === 'MOCK' ? 'warning' : 'info'}>e-Invoice {portal.einvoice.status}. {portal.einvoice.portalMessage} {portal.einvoice.irn ? `IRN ${portal.einvoice.irn}` : ''}</Alert>}
      {portal?.eway && <Alert severity={portal.eway.status === 'MOCK' ? 'warning' : 'info'}>e-Way {portal.eway.status}. {portal.eway.portalMessage} {portal.eway.ewayNo ? `EWB ${portal.eway.ewayNo}` : ''}</Alert>}
      {portal?.status === 'FINAL' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button color="secondary" onClick={() => portalCall('einvoice/cancel', { reason: '2', remark: 'Data entry mistake' })}>Cancel IRN request</Button>
          <Button color="secondary" onClick={() => portalCall('eway/cancel', { reason: '2', remark: 'Data entry mistake' })}>Cancel e-way request</Button>
        </Stack>
      )}
      <Paper sx={{ overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Number</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Buyer</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {(invoices.data ?? []).map((invoice) => (
              <TableRow key={invoice.id} hover selected={invoice.id === currentId}>
                <TableCell>{invoice.number}</TableCell>
                <TableCell>{invoice.invoiceDate}</TableCell>
                <TableCell>{invoice.buyerName}</TableCell>
                <TableCell align="right">{inr(invoice.total)}</TableCell>
                <TableCell>{invoice.status}</TableCell>
                <TableCell align="right"><Button onClick={() => setCurrentId(invoice.id)}>Open</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  )

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }
}
