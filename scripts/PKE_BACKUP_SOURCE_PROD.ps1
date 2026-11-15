<#
PKE_BACKUP_SOURCE_PROD.ps1 — Rev 5.2 hardened, deterministic, sanitized backup procedure (PREPARED, NOT EXECUTED)
Policy: READ-ONLY against legacy source only. NO restore, NO DDL/DML, NO role/Auth/Storage changes,
       NO extra Neon project/branch, NO local DB/Docker, NO legacy deletion, NO secrets in logs/manifest/args.

Source (fixed target): project lucky-glitter-99553107, branch br-calm-glade-b3nrleet, database neondb.
Prereqs (owner-provided via secure local env, not chat):
  - PostgreSQL 18 client tools (pg_dump/pg_restore/psql). Default: C:\Program Files\PostgreSQL\18\bin
  - $env:SOURCE_OWNER_DATABASE_URL = owner-privilege READ-ONLY connection to the source above.
    (DO NOT use app_runtime_secure for full backup.) Value must never be printed or passed as argv.

Run (after creds available & owner-approved for backup execution):
  .\scripts\PKE_BACKUP_SOURCE_PROD.ps1 [-PgBin <path>] [-OutRoot <path>]

Outputs (fresh timestamped folder only; never reuse 20261113_183300):
  D:\PKE\_db_sync\production\<yyyyMMdd_HHmmss>\
    full.dump, schema.sql, migration_history.csv, source_inventory.json, object_inventory.json,
    row_counts.json, role_grant_inventory.json, restore_toc.list, source_pg_version.txt,
    checksums.sha256, checksums_manifest.sha256, manifest.json, execution.sanitized.log

STOP after successful backup + integrity gates. Restore requires separate target preflight/mapping/owner approval.
#>
[CmdletBinding()]
param(
  [string]$OutRoot = "D:\PKE\_db_sync\production",
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$SourceProjectId = "lucky-glitter-99553107",
  [string]$SourceBranchId = "br-calm-glade-b3nrleet",
  [string]$SourceDatabase = "neondb",
  [string[]]$ExpectedSourceHosts = @(
    "ep-restless-hat-b35j9x0d.c-4.ap-southeast-1.aws.neon.tech",
    "ep-restless-hat-b35j9x0d-pooler.c-4.ap-southeast-1.aws.neon.tech"
  )
)

$ErrorActionPreference = 'Stop'
$script:LogPath = $null
$script:HadFailure = $false
$script:GateResults = [ordered]@{}
$script:PgPassFile = $null

function Write-Log([string]$Level, [string]$Message) {
  $line = "$(Get-Date -Format o) [$Level] $Message"
  Write-Host $line
  if ($script:LogPath) { Add-Content -Path $script:LogPath -Value $line -Encoding UTF8 }
}
function Fail([string]$Message) {
  $script:HadFailure = $true
  Write-Log 'FAIL' $Message
  throw "[PKE_BACKUP] FAIL (fail-closed): $Message"
}
function Set-Gate([string]$Name, [string]$Status, [string]$Detail) {
  $script:GateResults[$Name] = [ordered]@{ status = $Status; detail = $Detail }
  Write-Log 'GATE' "$Name=$Status $Detail"
}

function Invoke-Pg([string]$Exe, [string[]]$ArgList, [string]$Label, [string]$OutFile = $null) {
  # Runs native PG tool without passing connection URL as argv. Uses env vars/pgpassfile.
  # Captures $LASTEXITCODE explicitly; fails closed on any non-zero or invocation error.
  $global:LASTEXITCODE = $null
  try {
    if ($OutFile) {
      & $Exe @ArgList 2>&1 | Set-Content -Path $OutFile -Encoding UTF8
    } else {
      $output = & $Exe @ArgList 2>&1
      $global:__pke_last_out = $output
    }
  } catch {
    Fail "$Label invocation error: $($_.Exception.GetType().Name)"
  }
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 } # successful non-native-like cases guarded above; native sets LASTEXITCODE
  if ($code -ne 0) {
    if ($OutFile -and (Test-Path $OutFile)) { Remove-Item $OutFile -Force -ErrorAction SilentlyContinue }
    Fail "$Label failed (exit $code). Output redacted from artifacts."
  }
  return $global:__pke_last_out
}

function New-RestrictedTempPassFile([string]$HostName, [int]$Port, [string]$Db, [string]$User, [string]$Pass) {
  $path = Join-Path $env:TEMP ("pke_pgpass_" + [Guid]::NewGuid().ToString("N"))
  # pgpass format: hostname:port:database:username:password (escape \ and :)
  $esc = { param($s) ($s -replace '\\','\\' -replace ':','\:') }
  $line = "{0}:{1}:{2}:{3}:{4}" -f (& $esc $HostName), $Port, (& $esc $Db), (& $esc $User), (& $esc $Pass)
  Set-Content -Path $path -Value $line -Encoding ASCII -NoNewline
  # Restrict ACL to current user only (best-effort on Windows)
  try {
    $acl = Get-Acl $path
    $acl.SetAccessRuleProtection($true, $false)
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($me,'FullControl','Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -Path $path -AclObject $acl
  } catch { Write-Log 'WARN' 'Could not fully restrict pgpass ACL (best-effort).' }
  return $path
}

try {
  if ([string]::IsNullOrWhiteSpace($env:SOURCE_OWNER_DATABASE_URL)) {
    Fail "SOURCE_OWNER_DATABASE_URL not set. Provide owner read-only source creds via secure local env. No chat secrets."
  }
  if ($OutRoot -match '20261113_183300') { Fail "Refusing to write into historical backup path 20261113_183300." }
  if (-not (Test-Path $PgBin)) { Fail "PostgreSQL bin not found: $PgBin" }
  $pgDump = Join-Path $PgBin 'pg_dump.exe'; $pgRestore = Join-Path $PgBin 'pg_restore.exe'; $psql = Join-Path $PgBin 'psql.exe'
  foreach ($t in @($pgDump,$pgRestore,$psql)) { if (-not (Test-Path $t)) { Fail "Missing tool: $t" } }

  # --- Parse/validate source identity WITHOUT printing URL/credentials ---
  $uri = $null
  try { $uri = [Uri]$env:SOURCE_OWNER_DATABASE_URL } catch { Fail "SOURCE_OWNER_DATABASE_URL is not a valid URI." }
  $hostName = $uri.Host
  $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  $dbName = ($uri.AbsolutePath.Trim('/') -split '/')[0]
  $userinfo = [Uri]::UnescapeDataString($uri.UserInfo)
  $dbUser = if ($userinfo -match ':') { $userinfo.Substring(0, $userinfo.IndexOf(':')) } else { $userinfo }
  $dbPass = if ($userinfo -match ':') { $userinfo.Substring($userinfo.IndexOf(':') + 1) } else { '' }
  $sslmode = 'unknown'
  if ($uri.Query) {
    $q = $uri.Query.TrimStart('?') -split '&'
    foreach ($kv in $q) { $p = $kv -split '=',2; if ($p[0] -eq 'sslmode' -and $p.Count -gt 1) { $sslmode = [Uri]::UnescapeDataString($p[1]) } }
  }

  if ($dbName -ne $SourceDatabase) { Fail "Source database mismatch (expected $SourceDatabase)." }
  if ($hostName -match 'ep-odd-resonance-b3zb42fw|purple-base-63944903') { Fail "Refusing: resolved host looks like mandated TARGET, not source." }
  if ($hostName -notin $ExpectedSourceHosts) { Fail "Source host not in expected allowlist for $SourceProjectId/$SourceBranchId. Branch identity not adequately verified; refusing." }
  if ($sslmode -notin @('require','verify-ca','verify-full')) { Fail "Source sslmode must be require/verify-ca/verify-full." }
  if ([string]::IsNullOrWhiteSpace($dbUser) -or [string]::IsNullOrWhiteSpace($dbPass)) { Fail "Source credentials incomplete." }

  $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
  $outDir = Join-Path $OutRoot $ts
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $script:LogPath = Join-Path $outDir 'execution.sanitized.log'
  "# PKE source backup (sanitized) $ts`nsource_project=$SourceProjectId`nsource_branch=$SourceBranchId`nsource_database=$SourceDatabase`npg_bin=$PgBin`nbranch_identity=host_allowlist_match`nsource_not_mutated=true" | Set-Content -Path $script:LogPath -Encoding UTF8

  # Secure connection env (no URL argv). Password via restricted temp pgpassfile.
  $script:PgPassFile = New-RestrictedTempPassFile -HostName $hostName -Port $port -Db $dbName -User $dbUser -Pass $dbPass
  $env:PGHOST = $hostName; $env:PGPORT = "$port"; $env:PGDATABASE = $dbName; $env:PGUSER = $dbUser
  $env:PGSSLMODE = $sslmode; $env:PGPASSFILE = $script:PgPassFile; $env:PGCONNECT_TIMEOUT = '20'
  # Remove from process env any accidental URL-based vars for child safety is not possible here; we avoid passing them.

  $pgDumpVer = ((& $pgDump --version 2>&1) -join ' ').Trim(); if ($LASTEXITCODE -ne 0) { Fail "pg_dump --version failed." }
  $pgRestoreVer = ((& $pgRestore --version 2>&1) -join ' ').Trim(); if ($LASTEXITCODE -ne 0) { Fail "pg_restore --version failed." }
  $psqlVer = ((& $psql --version 2>&1) -join ' ').Trim(); if ($LASTEXITCODE -ne 0) { Fail "psql --version failed." }
  Write-Log 'INFO' "pg_dump=$pgDumpVer"; Write-Log 'INFO' "pg_restore=$pgRestoreVer"; Write-Log 'INFO' "psql=$psqlVer"

  $commonPsql = @('-v','ON_ERROR_STOP=1','-X','-q')
  $invTs = (Get-Date).ToUniversalTime().ToString('o')

  # --- Server version ---
  $verFile = Join-Path $outDir 'source_pg_version.txt'
  Invoke-Pg $psql ($commonPsql + @('-Atc','select version();')) 'psql server version' $verFile | Out-Null
  Set-Gate 'server_version' 'PASS' 'source_pg_version.txt'

  # --- Schema/object inventory (read-only, actual structure) ---
  $invFile = Join-Path $outDir 'source_inventory.json'
  $invSql = @"
select jsonb_pretty(jsonb_build_object(
  'inventory_utc',$invTs::text,
  'schemas',(select jsonb_agg(nspname order by nspname) from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'),
  'tables_total',(select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')),
  'base_tables',(select count(*) from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')),
  'views',(select count(*) from information_schema.views where table_schema not in ('pg_catalog','information_schema')),
  'matviews',(select count(*) from pg_matviews),
  'sequences',(select count(*) from information_schema.sequences where sequence_schema not in ('pg_catalog','information_schema')),
  'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema')),
  'indexes',(select count(*) from pg_indexes where schemaname not in ('pg_catalog','information_schema')),
  'constraints',(select count(*) from information_schema.table_constraints where constraint_schema not in ('pg_catalog','information_schema')),
  'triggers',(select count(*) from information_schema.triggers where trigger_schema not in ('pg_catalog','information_schema')),
  'extensions',(select coalesce(jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion) order by e.extname),'[]'::jsonb) from pg_extension e),
  'rls_enabled_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relrowsecurity),
  'force_rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relforcerowsecurity),
  'policies',(select count(*) from pg_policies),
  'security_definer_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname not in ('pg_catalog','information_schema'))
));
"@
  Invoke-Pg $psql ($commonPsql + @('-Atc',$invSql)) 'psql source inventory' $invFile | Out-Null
  Set-Gate 'source_inventory' 'PASS' 'source_inventory.json'

  # Detailed object inventory (no passwords)
  $objFile = Join-Path $outDir 'object_inventory.json'
  $objSql = @"
select jsonb_pretty(jsonb_build_object(
  'base_tables',(select coalesce(jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name) order by table_schema,table_name),'[]'::jsonb) from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')),
  'views',(select coalesce(jsonb_agg(jsonb_build_object('schema',table_schema,'view',table_name) order by table_schema,table_name),'[]'::jsonb) from information_schema.views where table_schema not in ('pg_catalog','information_schema')),
  'matviews',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'matview',matviewname) order by schemaname,matviewname),'[]'::jsonb) from pg_matviews),
  'sequences',(select coalesce(jsonb_agg(jsonb_build_object('schema',sequence_schema,'sequence',sequence_name) order by sequence_schema,sequence_name),'[]'::jsonb) from information_schema.sequences where sequence_schema not in ('pg_catalog','information_schema')),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'function',p.proname,'security_definer',p.prosecdef,'search_path',(select array_to_string(proconfig,',') from unnest(coalesce(p.proconfig, array[]::text[])) as proconfig where proconfig like 'search_path=%' limit 1)) order by n.nspname,p.proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema')),
  'indexes',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'index',indexname) order by schemaname,tablename,indexname),'[]'::jsonb) from pg_indexes where schemaname not in ('pg_catalog','information_schema')),
  'constraints',(select coalesce(jsonb_agg(jsonb_build_object('schema',constraint_schema,'table',table_name,'constraint',constraint_name,'type',constraint_type) order by constraint_schema,table_name,constraint_name),'[]'::jsonb) from information_schema.table_constraints where constraint_schema not in ('pg_catalog','information_schema')),
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('schema',trigger_schema,'table',event_object_table,'trigger',trigger_name) order by trigger_schema,event_object_table,trigger_name),'[]'::jsonb) from information_schema.triggers where trigger_schema not in ('pg_catalog','information_schema')),
  'rls',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema')),
  'policies',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'policy',policyname,'cmd',cmd,'roles',roles) order by schemaname,tablename,policyname),'[]'::jsonb) from pg_policies),
  'owners',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner)) order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','v','m','S') and n.nspname not in ('pg_catalog','information_schema'))
));
"@
  Invoke-Pg $psql ($commonPsql + @('-Atc',$objSql)) 'psql object inventory' $objFile | Out-Null
  Set-Gate 'object_inventory' 'PASS' 'object_inventory.json'

  # --- Migration history (actual structure: public.migration_history with id,filename,sha256,applied_at,status) ---
  $migFile = Join-Path $outDir 'migration_history.csv'
  $migCheckSql = "select 1 from information_schema.tables where table_schema='public' and table_name='migration_history';"
  $migExistsOut = Join-Path $outDir '.mig_exists.tmp'
  Invoke-Pg $psql ($commonPsql + @('-Atc',$migCheckSql)) 'psql migration table check' $migExistsOut | Out-Null
  $migExists = ((Get-Content $migExistsOut -Raw -ErrorAction SilentlyContinue) + '').Trim()
  Remove-Item $migExistsOut -Force -ErrorAction SilentlyContinue
  if ($migExists -ne '1') {
    Set-Gate 'migration_history' 'FAIL' 'public.migration_history not found (required).'
    Fail 'Migration history export failed: public.migration_history table not found.'
  }
  # Export with known columns; validate 001-035 present (count/range/status/checksum presence) in a separate validation file
  $migCopySql = "\copy (select id, filename, sha256, applied_at, status from public.migration_history order by id asc) to '$($migFile -replace '\\','/')' with (format csv, header true)"
  Invoke-Pg $psql ($commonPsql + @('-c',$migCopySql)) 'psql migration history export' | Out-Null
  $migValFile = Join-Path $outDir 'migration_history_validation.json'
  $migValSql = @"
select jsonb_pretty(jsonb_build_object(
  'count',(select count(*) from public.migration_history),
  'min_id',(select min(id) from public.migration_history),
  'max_id',(select max(id) from public.migration_history),
  'distinct_statuses',(select coalesce(jsonb_agg(distinct status order by status),'[]'::jsonb) from public.migration_history),
  'missing_001_035',(select coalesce(jsonb_agg(n order by n),'[]'::jsonb) from generate_series(1,35) n where not exists (select 1 from public.migration_history m where m.id::text = lpad(n::text,3,'0') or m.filename like lpad(n::text,3,'0') || '%')),
  'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'filename',filename,'sha256',sha256,'applied_at',applied_at,'status',status) order by id),'[]'::jsonb) from public.migration_history)
));
"@
  Invoke-Pg $psql ($commonPsql + @('-Atc',$migValSql)) 'psql migration history validation' $migValFile | Out-Null
  $migVal = Get-Content $migValFile -Raw | ConvertFrom-Json
  $migMissing = @($migVal.missing_001_035)
  if ($migVal.count -lt 1) { Set-Gate 'migration_history' 'FAIL' 'empty export'; Fail 'Migration history export empty.' }
  if ($migMissing.Count -gt 0) {
    Set-Gate 'migration_history' 'WARN' "exported count=$($migVal.count) but missing_in_001_035=$($migMissing -join ',') (reconciliation required)"
  } else {
    Set-Gate 'migration_history' 'PASS' "exported count=$($migVal.count) range=$($migVal.min_id)-$($migVal.max_id)"
  }

  # --- Role/grant inventory (no password hashes) ---
  $roleFile = Join-Path $outDir 'role_grant_inventory.json'
  $roleSql = @"
select jsonb_pretty(jsonb_build_object(
  'roles',(select coalesce(jsonb_agg(jsonb_build_object('rolname',rolname,'rolsuper',rolsuper,'rolbypassrls',rolbypassrls,'rolcreatedb',rolcreatedb,'rolcreaterole',rolcreaterole,'rolcanlogin',rolcanlogin) order by rolname),'[]'::jsonb) from pg_roles),
  'table_privileges',(select coalesce(jsonb_agg(jsonb_build_object('grantee',grantee,'schema',table_schema,'table',table_name,'privilege',privilege_type) order by grantee,table_schema,table_name,privilege_type),'[]'::jsonb) from information_schema.role_table_grants where table_schema not in ('pg_catalog','information_schema'))
));
"@
  Invoke-Pg $psql ($commonPsql + @('-Atc',$roleSql)) 'psql role/grant inventory' $roleFile | Out-Null
  Set-Gate 'role_grant_inventory' 'PASS' 'role_grant_inventory.json (no passwords)'

  # --- Per-table row counts (all base tables, validated; no silent partial success) ---
  $tblFile = Join-Path $outDir 'base_tables.list'
  Invoke-Pg $psql ($commonPsql + @('-Atc',"select table_schema||'.'||table_name from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema') order by 1;")) 'psql base table list' $tblFile | Out-Null
  $tables = @(Get-Content $tblFile | Where-Object { $_ -and $_.Trim() -ne '' })
  $rc = @(); $rcFail = 0
  $rowTs = (Get-Date).ToUniversalTime().ToString('o')
  foreach ($fq in $tables) {
    $safeExpr = "format('%I.%I', split_part('$fq','.',1), split_part('$fq','.',2))"
    $countSql = "select count(*) from (select 1 from $(format('%s', $fq)) x) q;" # fallback not used; use format in SQL below
    $q = "select count(*)::bigint from $( & { param($s) $parts=$s.Split('.',2); '\"' + $parts[0].Replace('\"','\"\"') + '\".\"' + $parts[1].Replace('\"','\"\"') + '\"' } $fq );"
    # Use pg_catalog.format via SQL for correct identifier quoting (no PowerShell backslash escaping into SQL literals)
    $q2 = "select count(*)::bigint from pg_catalog.format('%I.%I', split_part('$fq','.',1), split_part('$fq','.',2));" # invalid usage; build properly below
  }
  # Build row counts with correct SQL identifier quoting via format(%I.%I)
  $rc = @(); $rcFail = 0
  foreach ($fq in $tables) {
    $parts = $fq.Split('.',2); $sch = $parts[0]; $tbl = $parts[1]
    # Escape single quotes for SQL literal args
    $schL = $sch.Replace("'","''"); $tblL = $tbl.Replace("'","''")
    $countQuery = "do `$`$ declare q text; c bigint; begin q := format('select count(*) from %I.%I', '$schL', '$tblL'); execute q into c; raise notice 'RC=%', c; end `$`$;"
    # simpler: select with format in FROM via execute not directly possible; use psql variable-free query
    $countQuery2 = "select (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', '$schL', '$tblL'), false, true, '')))[1]::text::bigint;"
    $tmp = Join-Path $outDir '.rc.tmp'
    $global:LASTEXITCODE = $null
    try { & $psql @($commonPsql + @('-Atc',$countQuery2)) 2>$null | Set-Content $tmp -Encoding UTF8 } catch { $global:LASTEXITCODE = 1 }
    $code = $LASTEXITCODE; if ($null -eq $code) { $code = 0 }
    if ($code -ne 0 -or -not (Test-Path $tmp)) {
      $rc += [ordered]@{ schema=$sch; table=$tbl; rows=$null; status='FAIL'; captured_utc=$rowTs }
      $rcFail++
    } else {
      $val = ((Get-Content $tmp -Raw -ErrorAction SilentlyContinue) + '').Trim()
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
      if ($val -notmatch '^\d+$') { $rc += [ordered]@{ schema=$sch; table=$tbl; rows=$null; status='FAIL'; captured_utc=$rowTs }; $rcFail++ }
      else { $rc += [ordered]@{ schema=$sch; table=$tbl; rows=[int64]$val; status='OK'; captured_utc=$rowTs } }
    }
  }
  ($rc | ConvertTo-Json -Depth 4) | Set-Content (Join-Path $outDir 'row_counts.json') -Encoding UTF8
  if ($rcFail -gt 0) { Set-Gate 'row_counts' 'FAIL' "$rcFail table(s) failed count; inventory incomplete." ; Fail "Row-count inventory incomplete ($rcFail failures)." }
  else { Set-Gate 'row_counts' 'PASS' "$($rc.Count) base tables counted at $rowTs (not a single-snapshot claim with pg_dump)." }

  # --- Dumps (consistent snapshot via pg_dump; read-only) ---
  $full = Join-Path $outDir 'full.dump'; $schema = Join-Path $outDir 'schema.sql'
  Write-Log 'INFO' 'Creating full custom-format dump (pg_dump -Fc)...'
  Invoke-Pg $pgDump @('-Fc','--no-password','-f',$full) 'pg_dump full' | Out-Null
  if (-not (Test-Path $full) -or (Get-Item $full).Length -le 0) { Fail 'Full dump missing or empty.' }
  Set-Gate 'full_dump' 'PASS' "full.dump bytes=$((Get-Item $full).Length)"

  Write-Log 'INFO' 'Creating schema-only dump...'
  Invoke-Pg $pgDump @('-s','--no-password','-f',$schema) 'pg_dump schema-only' | Out-Null
  if (-not (Test-Path $schema) -or (Get-Item $schema).Length -le 0) { Fail 'Schema dump missing or empty.' }
  Set-Gate 'schema_dump' 'PASS' "schema.sql bytes=$((Get-Item $schema).Length)"

  Write-Log 'INFO' 'Listing TOC (pg_restore --list)...'
  $toc = Join-Path $outDir 'restore_toc.list'
  Invoke-Pg $pgRestore @('--list',$full) 'pg_restore --list' $toc | Out-Null
  if (-not (Test-Path $toc) -or (Get-Item $toc).Length -le 0) { Fail 'TOC listing missing or empty.' }
  Set-Gate 'toc_list' 'PASS' 'restore_toc.list'

  # --- Checksums for artifacts (excluding checksum index files created after) ---
  $artifactFiles = Get-ChildItem $outDir -File | Where-Object { $_.Name -notin @('checksums.sha256','checksums_manifest.sha256','manifest.json') }
  $hashLines = foreach ($f in $artifactFiles) { $h = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower(); "$h  $($f.Name)" }
  $hashLines | Set-Content (Join-Path $outDir 'checksums.sha256') -Encoding UTF8
  # Verify
  $verifyFail = 0
  Get-Content (Join-Path $outDir 'checksums.sha256') | ForEach-Object {
    if (-not $_) { return }; $p = $_ -split '\s{2,}',2; $exp=$p[0]; $n=$p[1]
    $act=(Get-FileHash (Join-Path $outDir $n) -Algorithm SHA256).Hash.ToLower()
    if ($act -ne $exp) { $verifyFail++ }
  }
  if ($verifyFail -gt 0) { Set-Gate 'checksums' 'FAIL' "$verifyFail mismatch(es)"; Fail "Checksum verification failed." }
  Set-Gate 'checksums' 'PASS' 'checksums.sha256 verified'

  # --- Manifest (no secrets; manifest hash recorded separately, not self-referential) ---
  $manifest = [ordered]@{
    timestamp_utc = $ts
    source = [ordered]@{ project_id=$SourceProjectId; branch_id=$SourceBranchId; database=$SourceDatabase; host_identity='allowlist_match'; sslmode=$sslmode; branch_identity_method='confirmed_endpoint_allowlist (insufficient alone for Neon control-plane proof; owner must ensure correct branch)'; mutated=$false }
    postgresql = [ordered]@{ server_version = ((Get-Content (Join-Path $outDir 'source_pg_version.txt') -Raw) + '').Trim(); pg_dump=$pgDumpVer; pg_restore=$pgRestoreVer; psql=$psqlVer }
    artifacts = (Get-ChildItem $outDir -File | Where-Object { $_.Name -ne 'checksums_manifest.sha256' } | ForEach-Object { [ordered]@{ name=$_.Name; bytes=$_.Length } })
    gates = $script:GateResults
    limitations = @(
      'pg_dump provides internal snapshot consistency; per-table row counts collected separately at recorded timestamps (not identical-snapshot claim).',
      'Neon managed schemas (e.g. neon_auth, pgrst) must be identified/mapped before target restore; do not overwrite target Neon Auth.',
      'CSV/migration exports are reconciliation artifacts, not substitutes for full.dump.',
      'Branch identity verified against expected endpoint allowlist; control-plane project/branch proof requires Neon API/console evidence if available.'
    )
    notes = @('Fresh backup only; do not reuse 20261113_183300. No credentials included. STOP before restore.')
  }
  $manifestPath = Join-Path $outDir 'manifest.json'
  ($manifest | ConvertTo-Json -Depth 8) | Set-Content -Path $manifestPath -Encoding UTF8
  $mhash = (Get-FileHash $manifestPath -Algorithm SHA256).Hash.ToLower()
  "$mhash  manifest.json" | Set-Content (Join-Path $outDir 'checksums_manifest.sha256') -Encoding UTF8
  Set-Gate 'manifest' 'PASS' 'manifest.json + checksums_manifest.sha256'

  # Best-effort restrict output directory ACL
  try {
    $acl = Get-Acl $outDir; $acl.SetAccessRuleProtection($true,$false)
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($me,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.SetAccessRule($rule); Set-Acl -Path $outDir -AclObject $acl
  } catch { Write-Log 'WARN' 'Could not fully restrict output directory ACL (best-effort).' }

  $allPass = ($script:GateResults.Values | Where-Object { $_.status -eq 'FAIL' }).Count -eq 0
  if (-not $allPass) { Fail 'One or more gates failed.' }
  Set-Gate 'overall' 'PASS' "Backup directory: $outDir. Review all gates before any restore. STOP before restore."
  Write-Log 'INFO' "DONE (gates passed). Directory: $outDir. STOP before restore/target mutation."

} finally {
  # Scrub sensitive env and temp passfile
  foreach ($k in @('PGPASSWORD','PGPASSFILE','PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGCONNECT_TIMEOUT')) {
    Remove-Item "Env:$k" -ErrorAction SilentlyContinue
  }
  if ($script:PgPassFile -and (Test-Path $script:PgPassFile)) {
    Remove-Item $script:PgPassFile -Force -ErrorAction SilentlyContinue
  }
}
