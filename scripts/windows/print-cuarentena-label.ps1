[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$TemplatePath,
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$PrinterName,
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Producto,
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Lote,
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Fecha,
    [Parameter(Mandatory = $true)][ValidateRange(1, 100)][int]$Copies,
    [Parameter(Mandatory = $false)][ValidateNotNullOrEmpty()][string]$PreviewPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $TemplatePath -PathType Leaf)) {
    throw 'No se encontró la plantilla de cuarentena.'
}

$printer = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $PrinterName } | Select-Object -First 1
if (-not $printer) { throw "La impresora '$PrinterName' no está disponible." }
if ($printer.WorkOffline) { throw "La impresora '$PrinterName' figura desconectada." }

$document = $null
$started = $false
try {
    $document = New-Object -ComObject 'bpac.Document'
    if (-not $document.Open($TemplatePath)) { throw 'No se pudo abrir la plantilla de cuarentena.' }
    if (-not $document.SetPrinter($PrinterName, $true)) { throw "No se pudo seleccionar la impresora '$PrinterName'." }

    # La plantilla conserva producto, lote y fecha como un único objeto de texto.
    # Al cambiar su contenido completo mantenemos sus posiciones y evitamos que
    # P-touch Editor abra el diseño durante cada impresión.
    $field = $document.GetObject('DATOS_CUARENTENA')
    if ($null -eq $field) { throw "La plantilla no contiene el campo requerido 'DATOS_CUARENTENA'." }

    $labelText = "MATERIA PRIMA`r`n$Producto`r`nLOTE`r`n$Lote`r`nFECHA`r`n$Fecha"
    $field.GetType().InvokeMember(
        'Text',
        [System.Reflection.BindingFlags]::SetProperty,
        $null,
        $field,
        @($labelText)
    )

    if ($PreviewPath) {
        $previewDirectory = Split-Path -Parent $PreviewPath
        if (-not (Test-Path -LiteralPath $previewDirectory -PathType Container)) {
            throw 'No existe la carpeta indicada para la vista previa.'
        }
        if (-not $document.Export(4, $PreviewPath, 180)) { throw 'No se pudo generar la vista previa de la etiqueta.' }
        return
    }

    $document.StartPrint('AleBet Cuarentena', 0)
    $started = $true
    $document.PrintOut($Copies, 0)
    $document.EndPrint()
    $started = $false
} finally {
    if ($null -ne $document) {
        if ($started) { try { $document.EndPrint() } catch {} }
        try { $document.Close() } catch {}
        try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) } catch {}
    }
}
