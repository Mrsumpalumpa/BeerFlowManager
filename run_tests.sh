#!/usr/bin/env bash

# Colores para la terminal
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}[ADVERTENCIA]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Comprobar la opción elegida
TARGET=${1:-all}

# Directorio del proyecto
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# --- 1. PRUEBAS UNITARIAS BACKEND ---
function run_backend_tests() {
    log_info "Iniciando pruebas unitarias del Backend..."

    # Comprobar si docker-compose está corriendo
    if ! docker compose ps | grep -q "Up"; then
        log_warn "Los contenedores Docker no están iniciados. Iniciando servicios necesarios..."
        docker compose up -d postgres redis mosquitto beerflow-service billing-service tap-management-service
        # Esperar a que los servicios estén sanos
        log_info "Esperando a que los servicios se estabilicen..."
        sleep 6
    fi

    # Ejecutar pruebas dentro de los contenedores
    log_info "Ejecutando pruebas en beerflow-service..."
    docker compose exec -T beerflow-service pytest -v
    BF_STATUS=$?

    log_info "Ejecutando pruebas en billing-service..."
    docker compose exec -T billing-service pytest -v
    BILLING_STATUS=$?

    log_info "Ejecutando pruebas en tap-management-service..."
    docker compose exec -T tap-management-service pytest -v
    TAPS_STATUS=$?

    # Resumen de resultados
    if [ $BF_STATUS -eq 0 ] && [ $BILLING_STATUS -eq 0 ] && [ $TAPS_STATUS -eq 0 ]; then
        log_success "¡Todas las pruebas unitarias del backend pasaron con éxito!"
        return 0
    else
        log_error "Algunas pruebas unitarias del backend fallaron."
        [ $BF_STATUS -ne 0 ] && log_error "- Falló beerflow-service"
        [ $BILLING_STATUS -ne 0 ] && log_error "- Falló billing-service"
        [ $TAPS_STATUS -ne 0 ] && log_error "- Falló tap-management-service"
        return 1
    fi
}

# --- 2. PRUEBAS UNITARIAS FRONTEND ---
function run_frontend_tests() {
    log_info "Iniciando pruebas unitarias del Frontend..."
    
    # Comprobar si docker-compose está corriendo
    if ! docker compose ps | grep -q "Up"; then
        log_warn "Los contenedores Docker no están iniciados. Iniciando servicios necesarios..."
        docker compose up -d frontend
        log_info "Esperando a que los servicios se estabilicen..."
        sleep 5
    fi

    log_info "Ejecutando Vitest dentro del contenedor frontend..."
    docker compose exec -T frontend pnpm test:run
    FE_STATUS=$?

    if [ $FE_STATUS -eq 0 ]; then
        log_success "¡Todas las pruebas unitarias del frontend pasaron con éxito!"
        return 0
    else
        log_error "Las pruebas unitarias del frontend fallaron."
        return 1
    fi
}

# --- 3. PRUEBAS E2E ---
function run_e2e_tests() {
    log_info "Iniciando pruebas End-to-End (E2E) con Playwright..."
    
    # Asegurar que la aplicación esté corriendo completamente en Docker
    if ! docker compose ps | grep -q "Up"; then
        log_warn "Iniciando los contenedores de Docker para la prueba E2E..."
        docker compose up -d --build
        log_info "Esperando 8 segundos para que los contenedores estén completamente listos..."
        sleep 8
    fi

    cd "$PROJECT_ROOT/e2e" || exit

    if [ ! -d "node_modules" ]; then
        log_info "Instalando dependencias en directorio E2E..."
        npm install
        log_info "Instalando navegadores de Playwright..."
        npx playwright install chromium
    fi

    log_info "Ejecutando Playwright..."
    npx playwright test
    E2E_STATUS=$?

    if [ $E2E_STATUS -eq 0 ]; then
        log_success "¡Todas las pruebas E2E pasaron con éxito!"
        return 0
    else
        log_error "Las pruebas E2E fallaron."
        return 1
    fi
}

# Ejecución según parámetro
case "$TARGET" in
    backend)
        run_backend_tests
        exit $?
        ;;
    frontend)
        run_frontend_tests
        exit $?
        ;;
    e2e)
        run_e2e_tests
        exit $?
        ;;
    all)
        run_backend_tests
        BF_RES=$?
        
        run_frontend_tests
        FE_RES=$?
        
        run_e2e_tests
        E2E_RES=$?
        
        echo "----------------------------------------"
        if [ $BF_RES -eq 0 ] && [ $FE_RES -eq 0 ] && [ $E2E_RES -eq 0 ]; then
            log_success "¡Todas las suites de prueba pasaron correctamente (Backend, Frontend, E2E)!"
            exit 0
        else
            log_error "Se encontraron fallos en la suite de pruebas:"
            [ $BF_RES -ne 0 ] && log_error "- Fallaron las pruebas unitarias del Backend"
            [ $FE_RES -ne 0 ] && log_error "- Fallaron las pruebas unitarias del Frontend"
            [ $E2E_RES -ne 0 ] && log_error "- Fallaron las pruebas E2E"
            exit 1
        fi
        ;;
    *)
        log_error "Opción no válida. Uso: ./run_tests.sh [all|backend|frontend|e2e]"
        exit 1
        ;;
esac
