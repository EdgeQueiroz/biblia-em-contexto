param([Parameter(Mandatory)][string]$SourceDirectory)

$ErrorActionPreference = 'Stop'
$revision = 'ff9d4981eba2084c4914ca840ff323d85cbd2a1d'
$repository = "https://github.com/BetaMasaheft/Works/blob/$revision/"
$texts = [ordered]@{
    ENO = @{ Name = '1 Enoque'; Work = '1001-2000/LIT1340EnochE.xml'; Translation = 'https://bibliaetiope.com.br/pt/henok'; Aliases = @('Enoque', 'Henok') }
    JUB = @{ Name = 'Jubileus'; Work = '1001-2000/LIT1697Jubilees.xml'; Translation = 'https://bibliaetiope.com.br/pt/jubileus'; Aliases = @('Kufale') }
    '1MQ' = @{ Name = '1 Meqabyan'; Work = '1001-2000/LIT1819Maccab.xml'; Aliases = @() }
    '2MQ' = @{ Name = '2 Meqabyan'; Work = '5001-6000/LIT5840SecondEthioMaccabees.xml'; Aliases = @() }
    '3MQ' = @{ Name = '3 Meqabyan'; Work = '5001-6000/LIT5839ThirdEthioMaccabees.xml'; Aliases = @() }
    JUD = @{ Name = 'Judas'; Work = '3001-4000/LIT3513Epistle.xml'; Group = 'nn'; Aliases = @('Carta de Judas', 'Epístola de Judas') }
}

function Write-Json($Path, $Value) {
    ConvertTo-Json -InputObject $Value -Depth 8 -Compress |
        Set-Content -LiteralPath $Path -Encoding utf8NoBOM
}

$directory = Join-Path $PSScriptRoot 'docs/data/ethiopic'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$books = [Collections.Generic.List[object]]::new()
$search = [Collections.Generic.List[object]]::new()

foreach ($entry in $texts.GetEnumerator()) {
    $code = $entry.Key
    $book = $entry.Value
    [xml]$xml = Get-Content -LiteralPath (Join-Path $SourceDirectory "$code.xml") -Encoding utf8 -Raw
    $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('t', 'http://www.tei-c.org/ns/1.0')
    $edition = $xml.SelectNodes('//t:div[@type="edition"]', $ns) | Where-Object {
        if ($code -eq 'JUD') { $_.GetAttribute('lang', 'http://www.w3.org/XML/1998/namespace') -eq 'gez' }
        else { $_.SelectSingleNode('t:note', $ns).InnerText -match 'EOTC printed Bible|printed EOTC Bible' }
    }
    if (@($edition).Count -ne 1) { throw "Printed edition missing or ambiguous for $code" }

    $chapters = [ordered]@{}
    $divisions = if ($code -eq 'JUD') { ,$edition } else { $edition.SelectNodes('t:div[@subtype="chapter"]', $ns) }
    foreach ($chapter in $divisions) {
        $number = if ($code -eq 'JUD') { '1' } else { $chapter.GetAttribute('n') }
        if ($chapter.GetAttribute('id', 'http://www.w3.org/XML/1998/namespace') -eq 'introd') {
            $number = '0'
        } elseif (-not $number) {
            $number = [regex]::Match($chapter.SelectSingleNode('t:label', $ns).InnerText, '\d+').Value
        }
        if ($number -notmatch '^\d+$' -or $chapters.Contains($number)) { throw "Invalid chapter $number in $code" }
        $verses = [Collections.Generic.List[object]]::new()
        $labels = @{}
        foreach ($line in $chapter.SelectNodes('t:ab/t:l[@n]', $ns)) {
            $verse = $line.GetAttribute('n')
            $text = ($line.InnerText -replace '\s+', ' ').Trim()
            if (-not $verse -or -not $text) {
                throw "Invalid verse in $code ${number}:$verse"
            }
            $labels[$verse] = 1 + $labels[$verse]
            $reference = $verse
            $notes = @()
            if ($labels[$verse] -gt 1) {
                $reference += [char](96 + $labels[$verse])
                $notes = @("O número $verse se repete na transcrição. A letra distingue esta ocorrência no leitor.")
            }
            $verses.Add(@{ n = $reference; t = $text; notes = $notes })
            $search.Add(@($code, [int]$number, $reference, $text))
        }
        if ($verses.Count -eq 0) { throw "Empty chapter $number in $code" }
        $chapters[$number] = $verses
    }
    $numbers = @($chapters.Keys | ForEach-Object { [int]$_ } | Sort-Object)
    if (-not $numbers.Count -or $numbers.Count -ne ($numbers[-1] - $numbers[0] + 1)) {
        throw "Missing chapters in $code"
    }
    Write-Json (Join-Path $directory "$code.json") $chapters
    $books.Add(@{
        id = $code; name = $book.Name; chapters = $numbers; group = ($book.Group ?? 'oo'); source = 'ethiopic'
        url = $repository + $book.Work; translation = $book.Translation; aliases = $book.Aliases
    })
    Write-Output "$code $($chapters.Count) sections"
}
Write-Json (Join-Path $directory 'books.json') $books
Write-Json (Join-Path $directory 'search.json') $search
