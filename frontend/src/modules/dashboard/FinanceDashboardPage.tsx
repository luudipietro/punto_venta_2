import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBranches } from '@/hooks/useBranches'
import { useExchanges } from '@/hooks/useExchanges'
import { useExpenses } from '@/hooks/useExpenses'
import { useFinancialSummary } from '@/hooks/useFinancialSummary'
import { usePurchases } from '@/hooks/usePurchases'
import { useSales } from '@/hooks/useSales'
import { formatCurrency, formatDate } from '@/lib/format'
import { useTheme } from '@/theme/ThemeProvider'

const CHART_COLORS = {
  light: { sales: '#059669', purchases: '#e11d48', expenses: '#d97706' },
  dark: { sales: '#34d399', purchases: '#fb7185', expenses: '#fbbf24' },
}

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--popover)',
    borderColor: 'var(--border)',
    borderRadius: 8,
    color: 'var(--popover-foreground)',
  },
  labelStyle: { color: 'var(--popover-foreground)' },
  itemStyle: { color: 'var(--popover-foreground)' },
}

const axisTick = { fontSize: 12, fill: 'var(--muted-foreground)' }
const legendStyle = { fontSize: 12, color: 'var(--foreground)' }

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(value)}</p>
    </Card>
  )
}

export function FinanceDashboardPage() {
  const { theme } = useTheme()
  const colors = CHART_COLORS[theme]
  const { data: branches } = useBranches()
  const [startDate, setStartDate] = useState(firstOfMonthIso())
  const [endDate, setEndDate] = useState(todayIso())
  const [branchId, setBranchId] = useState<number | 'all'>('all')

  const { data: summary, isLoading } = useFinancialSummary(
    startDate,
    endDate,
    branchId === 'all' ? null : branchId,
  )

  const { data: sales } = useSales()
  const { data: purchases } = usePurchases()
  const { data: expenses } = useExpenses()
  const { data: exchanges } = useExchanges()

  const inRange = (isoDate: string) => {
    const day = isoDate.slice(0, 10)
    return day >= startDate && day <= endDate
  }

  const filteredSales = useMemo(
    () =>
      (sales ?? []).filter(
        (sale) =>
          !sale.cancelled_at &&
          inRange(sale.created_at) &&
          (branchId === 'all' || sale.branch_id === branchId),
      ),
    [sales, startDate, endDate, branchId],
  )
  const filteredPurchases = useMemo(
    () =>
      (purchases ?? []).filter(
        (purchase) =>
          purchase.is_paid &&
          !purchase.cancelled_at &&
          purchase.payment_date &&
          inRange(purchase.payment_date) &&
          (branchId === 'all' || purchase.branch_id === branchId),
      ),
    [purchases, startDate, endDate, branchId],
  )
  const filteredExpenses = useMemo(
    () =>
      (expenses ?? []).filter(
        (expense) =>
          inRange(expense.date) && (branchId === 'all' || expense.branch_id === branchId),
      ),
    [expenses, startDate, endDate, branchId],
  )
  const filteredExchanges = useMemo(
    () =>
      (exchanges ?? []).filter(
        (exchange) =>
          inRange(exchange.created_at) && (branchId === 'all' || exchange.branch_id === branchId),
      ),
    [exchanges, startDate, endDate, branchId],
  )

  return (
    <div>
      <PageHeader
        title="Finanzas"
        description="Análisis financiero por rango de fechas: totales, desglose por método de pago y evolución diaria."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="finance-start">Desde</Label>
          <Input
            id="finance-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="finance-end">Hasta</Label>
          <Input
            id="finance-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Sucursal</Label>
          <Select
            value={String(branchId)}
            onValueChange={(value) => setBranchId(value === 'all' ? 'all' : Number(value))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {branches?.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !summary ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ventas totales" value={summary.sales_total} />
            <StatCard label="Compras totales" value={summary.purchases_total} />
            <StatCard label="Gastos totales" value={summary.expenses_total} />
            <StatCard label="Balance neto de caja" value={summary.net_cash_balance} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-3 text-sm font-medium">Desglose por método de pago</p>
              {summary.payment_method_breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos en este rango.</p>
              ) : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.payment_method_breakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={axisTick} />
                        <YAxis tick={axisTick} />
                        <Tooltip
                          {...chartTooltipStyle}
                          formatter={(value) => formatCurrency(Number(value ?? 0))}
                        />
                        <Legend wrapperStyle={legendStyle} />
                        <Bar dataKey="sales_amount" name="Ventas" fill={colors.sales} />
                        <Bar dataKey="purchases_amount" name="Compras" fill={colors.purchases} />
                        <Bar dataKey="expenses_amount" name="Gastos" fill={colors.expenses} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Método</TableHead>
                        <TableHead>Ventas</TableHead>
                        <TableHead>Compras</TableHead>
                        <TableHead>Gastos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.payment_method_breakdown.map((row) => (
                        <TableRow key={row.payment_method_id}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>{formatCurrency(row.sales_amount)}</TableCell>
                          <TableCell>{formatCurrency(row.purchases_amount)}</TableCell>
                          <TableCell>{formatCurrency(row.expenses_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-sm font-medium">Ventas, compras y gastos por día</p>
              {summary.daily_series.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos en este rango.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.daily_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={axisTick}
                        tickFormatter={(value: string) => formatDate(value)}
                      />
                      <YAxis tick={axisTick} />
                      <Tooltip
                        {...chartTooltipStyle}
                        labelFormatter={(value) => formatDate(String(value))}
                        formatter={(value) => formatCurrency(Number(value ?? 0))}
                      />
                      <Legend wrapperStyle={legendStyle} />
                      <Line type="monotone" dataKey="sales" name="Ventas" stroke={colors.sales} />
                      <Line
                        type="monotone"
                        dataKey="purchases"
                        name="Compras"
                        stroke={colors.purchases}
                      />
                      <Line
                        type="monotone"
                        dataKey="expenses"
                        name="Gastos"
                        stroke={colors.expenses}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <Tabs defaultValue="sales">
              <TabsList>
                <TabsTrigger value="sales">Ventas ({filteredSales.length})</TabsTrigger>
                <TabsTrigger value="purchases">Compras ({filteredPurchases.length})</TabsTrigger>
                <TabsTrigger value="expenses">Gastos ({filteredExpenses.length})</TabsTrigger>
                <TabsTrigger value="exchanges">Cambios ({filteredExchanges.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="sales">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.id}</TableCell>
                        <TableCell>{formatDate(sale.created_at.slice(0, 10))}</TableCell>
                        <TableCell>{formatCurrency(sale.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="purchases">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Fecha de pago</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>{purchase.id}</TableCell>
                        <TableCell>
                          {purchase.payment_date ? formatDate(purchase.payment_date) : '-'}
                        </TableCell>
                        <TableCell>{formatCurrency(purchase.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="expenses">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.description}</TableCell>
                        <TableCell>{formatDate(expense.date)}</TableCell>
                        <TableCell>{formatCurrency(expense.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="exchanges">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Venta</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExchanges.map((exchange) => (
                      <TableRow key={exchange.id}>
                        <TableCell>{exchange.id}</TableCell>
                        <TableCell>#{exchange.sale_id}</TableCell>
                        <TableCell>{formatDate(exchange.created_at.slice(0, 10))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      )}
    </div>
  )
}
