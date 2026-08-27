#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de carteles de precio - REMODEL
-------------------------------------------
Pide por consola el tamaño de cartel a usar y los productos
(nombre, precio, detalle opcional y cantidad de carteles a
imprimir de cada uno) y arma un PDF en A4 listo para imprimir
y recortar.

Tamaños disponibles:
    1) A4 completo       -> 1 cartel por hoja
    2) Horizontal          -> 2 carteles por hoja
    3) A6 (el clásico)     -> 4 carteles por hoja
    4) Chico                -> 16 carteles por hoja (grilla 4x4)

Requisito: tener instalado reportlab.
    pip install reportlab
"""

import os
import sys
import datetime

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import HexColor
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
except ImportError:
    print("=" * 60)
    print("Falta instalar la libreria 'reportlab'.")
    print("Abri una consola y ejecuta:")
    print()
    print("    pip install reportlab")
    print()
    print("=" * 60)
    input("Presiona ENTER para salir...")
    sys.exit(1)


# ---------------------------------------------------------------
# Tipografia: Poppins (moderna, geometrica). Se registra desde los
# archivos .ttf incluidos en la carpeta "fuentes". Si por algun
# motivo no estan disponibles, se usa Helvetica como respaldo para
# que el programa nunca se rompa.
# ---------------------------------------------------------------
_CARPETA_SCRIPT = os.path.dirname(os.path.abspath(__file__))
_CARPETA_FUENTES = os.path.join(_CARPETA_SCRIPT, "fuentes")

try:
    pdfmetrics.registerFont(TTFont("Poppins-Bold", os.path.join(_CARPETA_FUENTES, "Poppins-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("Poppins-Medium", os.path.join(_CARPETA_FUENTES, "Poppins-Medium.ttf")))
    FUENTE_BOLD = "Poppins-Bold"
    FUENTE_REGULAR = "Poppins-Medium"
except Exception:
    FUENTE_BOLD = "Helvetica-Bold"
    FUENTE_REGULAR = "Helvetica"


# ---------------------------------------------------------------
# Configuracion visual (colores tomados del logo REMODEL)
# ---------------------------------------------------------------
COLOR_TEXTO = HexColor("#111111")
COLOR_DETALLE = HexColor("#555555")
COLOR_FOOTER_SUB = HexColor("#7a7a7a")
COLOR_ACENTO_1 = HexColor("#2fb6e6")   # celeste
COLOR_ACENTO_2 = HexColor("#4a7fe0")   # azul medio
COLOR_ACENTO_3 = HexColor("#8352d6")   # violeta
COLOR_PRECIO = HexColor("#4a6fd8")     # tono intermedio del degrade, usado en el precio

A4_ANCHO, A4_ALTO = A4          # en puntos (1 pt = 1/72 pulgada)

# Tamaños disponibles: filas x columnas de la grilla en la hoja A4
TAMANOS = {
    "1": {"nombre": "A4 completo (1 por hoja)",   "filas": 1, "columnas": 1},
    "2": {"nombre": "Horizontal (2 por hoja)",     "filas": 2, "columnas": 1},
    "3": {"nombre": "A6 clásico (4 por hoja)",     "filas": 2, "columnas": 2},
    "4": {"nombre": "Chico (16 por hoja, 4x4)",    "filas": 4, "columnas": 4},
}


def _dibujar_footer_una_linea(c, cx, y, tam_marca, tam_sub, max_ancho=None):
    """Dibuja 'REMODEL - Tu Hogar Renovado' en una sola linea, con
    'REMODEL' en negrita y el resto en un tono mas suave, centrado
    en cx. Si se pasa max_ancho, achica proporcionalmente ambas
    fuentes hasta que entre."""
    texto1 = "REMODEL"
    texto2 = " - Tu Hogar Renovado"

    if max_ancho is not None:
        while True:
            ancho1 = c.stringWidth(texto1, FUENTE_BOLD, tam_marca)
            ancho2 = c.stringWidth(texto2, FUENTE_REGULAR, tam_sub)
            if ancho1 + ancho2 <= max_ancho or tam_marca < 5:
                break
            tam_marca *= 0.96
            tam_sub *= 0.96

    ancho1 = c.stringWidth(texto1, FUENTE_BOLD, tam_marca)
    ancho2 = c.stringWidth(texto2, FUENTE_REGULAR, tam_sub)
    x_inicio = cx - (ancho1 + ancho2) / 2

    c.setFillColor(COLOR_TEXTO)
    c.setFont(FUENTE_BOLD, tam_marca)
    c.drawString(x_inicio, y, texto1)

    c.setFillColor(COLOR_FOOTER_SUB)
    c.setFont(FUENTE_REGULAR, tam_sub)
    c.drawString(x_inicio + ancho1, y, texto2)


# ---------------------------------------------------------------
# Layout VERTICAL (para carteles más altos que anchos: 1, 4 y 16 por hoja)
# ---------------------------------------------------------------
def dibujar_cartel_vertical(c, x0, y0, ancho, alto, nombre_producto, precio, detalle):
    cx = x0 + ancho / 2
    ref = ancho  # referencia para tamaños de fuente proporcionales

    # marco fino
    margen = ancho * 0.033
    c.setStrokeColor(COLOR_ACENTO_2)
    c.setLineWidth(1.3)
    c.roundRect(x0 + margen, y0 + margen, ancho - 2 * margen, alto - 2 * margen,
                radius=0, stroke=1, fill=0)

    # ---- icono techo/casa ----
    icono_y = y0 + alto - alto * 0.155
    ancho_techo = ancho * 0.19
    alto_techo = ancho_techo * 0.55

    c.setStrokeColor(COLOR_ACENTO_1)
    c.setLineWidth(max(1.2, ref * 0.014))
    c.setLineJoin(1)
    c.setLineCap(1)
    p = c.beginPath()
    p.moveTo(cx - ancho_techo, icono_y - alto_techo * 0.35)
    p.lineTo(cx, icono_y + alto_techo * 0.65)
    p.lineTo(cx + ancho_techo, icono_y - alto_techo * 0.35)
    c.drawPath(p, stroke=1, fill=0)

    # ventanita 2x2 debajo del techo
    lado = ancho_techo * 0.19
    sep = max(1, ref * 0.007)
    colores_vidrio = [HexColor("#3f8ade"), HexColor("#6470cf"),
                      HexColor("#5079d8"), HexColor("#7458cf")]
    posiciones = [(-lado - sep / 2, 0), (sep / 2, 0),
                  (-lado - sep / 2, -lado - sep), (sep / 2, -lado - sep)]
    for (dx, dy), col in zip(posiciones, colores_vidrio):
        c.setFillColor(col)
        c.rect(cx + dx, icono_y - alto_techo * 0.35 + dy, lado, lado, stroke=0, fill=1)

    # ---- linea separadora superior ----
    y_linea1 = y0 + alto - alto * 0.29
    c.setStrokeColor(COLOR_ACENTO_2)
    c.setLineWidth(max(0.8, ref * 0.0054))
    c.line(x0 + ancho * 0.16, y_linea1, x0 + ancho - ancho * 0.16, y_linea1)

    # ---- nombre del producto (hasta 2 lineas, ajustando tamaño si es largo) ----
    tam_fuente = ref * 0.0706
    tam_min = ref * 0.030
    max_ancho_txt = ancho - ancho * 0.20
    palabras = nombre_producto.upper().split()

    def _ancho_max_lineas_v(lineas_probar, tam):
        if not lineas_probar:
            return 0
        return max(c.stringWidth(l, FUENTE_BOLD, tam) for l in lineas_probar)

    # 1) primero probamos SOLO achicando la fuente, sin cortar palabras
    lineas = _armar_lineas(c, palabras, FUENTE_BOLD, tam_fuente, max_ancho_txt)
    while (len(lineas) > 2 or _ancho_max_lineas_v(lineas, tam_fuente) > max_ancho_txt) and tam_fuente > tam_min:
        tam_fuente -= ref * 0.003
        lineas = _armar_lineas(c, palabras, FUENTE_BOLD, tam_fuente, max_ancho_txt)

    # 2) si aun al tamaño minimo alguna palabra sola no entra, recien ahi
    #    la partimos caracter a caracter (ultimo recurso, nunca antes)
    if _ancho_max_lineas_v(lineas, tam_fuente) > max_ancho_txt:
        resultado = []
        for linea in lineas:
            if c.stringWidth(linea, FUENTE_BOLD, tam_fuente) <= max_ancho_txt:
                resultado.append(linea)
            else:
                resultado.extend(_partir_por_caracteres(c, linea, FUENTE_BOLD, tam_fuente, max_ancho_txt))
        lineas = resultado
    lineas = lineas[:2]

    c.setFillColor(COLOR_TEXTO)
    c.setFont(FUENTE_BOLD, tam_fuente)
    y_texto = y0 + alto - alto * 0.365
    interlineado = tam_fuente * 1.25
    if len(lineas) == 1:
        c.drawCentredString(cx, y_texto - interlineado * 0.4, lineas[0])
    else:
        c.drawCentredString(cx, y_texto, lineas[0])
        c.drawCentredString(cx, y_texto - interlineado, lineas[1])

    # ---- precio grande ----
    texto_precio = precio
    tam_precio = ancho * 0.155
    while c.stringWidth(texto_precio, FUENTE_BOLD, tam_precio) > ancho - ancho * 0.12 and tam_precio > ref * 0.05:
        tam_precio -= 1
    c.setFillColor(COLOR_PRECIO)
    c.setFont(FUENTE_BOLD, tam_precio)
    y_precio = y0 + alto * 0.44
    c.drawCentredString(cx, y_precio, texto_precio)

    # ---- linea separadora inferior ----
    y_linea3 = y0 + alto * 0.315
    c.setStrokeColor(COLOR_ACENTO_2)
    c.setLineWidth(max(0.8, ref * 0.0054))
    c.line(x0 + ancho * 0.16, y_linea3, x0 + ancho - ancho * 0.16, y_linea3)

    # ---- detalle opcional ----
    if detalle:
        c.setFillColor(COLOR_DETALLE)
        c.setFont(FUENTE_REGULAR, max(6, ref * 0.032))
        c.drawCentredString(cx, y_linea3 - alto * 0.045, detalle)

    # ---- footer marca (una sola linea) ----
    tam_marca = ref * 0.0504
    tam_sub = ref * 0.0504 * 0.72
    y_footer = y0 + alto * 0.085
    _dibujar_footer_una_linea(c, cx, y_footer, tam_marca, tam_sub, max_ancho=ancho - ancho * 0.14)


# ---------------------------------------------------------------
# Layout HORIZONTAL (para carteles más anchos que altos: 2 por hoja)
# ---------------------------------------------------------------
def dibujar_cartel_horizontal(c, x0, y0, ancho, alto, nombre_producto, precio, detalle):
    ref = alto  # referencia para tamaños proporcionales (la altura manda en horizontal)
    cy = y0 + alto / 2

    # marco fino
    margen = min(ancho, alto) * 0.03
    c.setStrokeColor(COLOR_ACENTO_2)
    c.setLineWidth(1.3)
    c.roundRect(x0 + margen, y0 + margen, ancho - 2 * margen, alto - 2 * margen,
                radius=0, stroke=1, fill=0)

    # ---- limites reales de cada columna (con relleno interno para que nada toque el marco) ----
    relleno = min(ancho, alto) * 0.055
    col_izq_min = x0 + margen + relleno
    col_izq_max = x0 + ancho * 0.5 - relleno
    col_der_min = x0 + ancho * 0.5 + relleno
    col_der_max = x0 + ancho - margen - relleno

    cx_izq = (col_izq_min + col_izq_max) / 2
    cx_der = (col_der_min + col_der_max) / 2
    max_ancho_izq = col_izq_max - col_izq_min
    max_ancho_der = col_der_max - col_der_min

    # ---- linea divisoria central ----
    c.setStrokeColor(COLOR_ACENTO_3)
    c.setLineWidth(1)
    c.line(x0 + ancho * 0.5, y0 + alto * 0.16, x0 + ancho * 0.5, y0 + alto * 0.82)

    # ---- icono techo/casa (columna izquierda, arriba) ----
    icono_y = y0 + alto - alto * 0.20
    ancho_techo = min(ref * 0.16, max_ancho_izq * 0.42)
    alto_techo = ancho_techo * 0.55

    c.setStrokeColor(COLOR_ACENTO_1)
    c.setLineWidth(max(1.2, ref * 0.018))
    c.setLineJoin(1)
    c.setLineCap(1)
    p = c.beginPath()
    p.moveTo(cx_izq - ancho_techo, icono_y - alto_techo * 0.35)
    p.lineTo(cx_izq, icono_y + alto_techo * 0.65)
    p.lineTo(cx_izq + ancho_techo, icono_y - alto_techo * 0.35)
    c.drawPath(p, stroke=1, fill=0)

    lado = ancho_techo * 0.19
    sep = max(1, ref * 0.01)
    colores_vidrio = [HexColor("#3f8ade"), HexColor("#6470cf"),
                      HexColor("#5079d8"), HexColor("#7458cf")]
    posiciones = [(-lado - sep / 2, 0), (sep / 2, 0),
                  (-lado - sep / 2, -lado - sep), (sep / 2, -lado - sep)]
    for (dx, dy), col in zip(posiciones, colores_vidrio):
        c.setFillColor(col)
        c.rect(cx_izq + dx, icono_y - alto_techo * 0.35 + dy, lado, lado, stroke=0, fill=1)

    # ---- nombre del producto (columna izquierda) ----
    tam_fuente = ref * 0.10
    tam_min = ref * 0.024
    palabras = nombre_producto.upper().split()

    def _ancho_max_lineas(lineas_probar, tam):
        if not lineas_probar:
            return 0
        return max(c.stringWidth(l, FUENTE_BOLD, tam) for l in lineas_probar)

    # 1) primero probamos SOLO achicando la fuente, sin cortar palabras
    lineas = _armar_lineas(c, palabras, FUENTE_BOLD, tam_fuente, max_ancho_izq)
    while (len(lineas) > 3 or _ancho_max_lineas(lineas, tam_fuente) > max_ancho_izq) and tam_fuente > tam_min:
        tam_fuente -= ref * 0.003
        lineas = _armar_lineas(c, palabras, FUENTE_BOLD, tam_fuente, max_ancho_izq)

    # 2) si aun al tamaño minimo alguna palabra sola no entra, recien ahi
    #    la partimos caracter a caracter (ultimo recurso, nunca antes)
    if _ancho_max_lineas(lineas, tam_fuente) > max_ancho_izq:
        resultado = []
        for linea in lineas:
            if c.stringWidth(linea, FUENTE_BOLD, tam_fuente) <= max_ancho_izq:
                resultado.append(linea)
            else:
                resultado.extend(_partir_por_caracteres(c, linea, FUENTE_BOLD, tam_fuente, max_ancho_izq))
        lineas = resultado

    c.setFillColor(COLOR_TEXTO)
    c.setFont(FUENTE_BOLD, tam_fuente)
    interlineado = tam_fuente * 1.22

    # el bloque de texto se centra a la misma altura que el precio (cy),
    # igual que en la columna derecha; solo si el bloque es muy alto
    # (nombres largos de 3 lineas) se lo empuja hacia abajo lo justo
    # para que no choque con el icono
    n_lineas = len(lineas)
    bloque_alto = (n_lineas - 1) * interlineado
    y_primera_centrada = cy + bloque_alto / 2 - tam_fuente * 0.32
    limite_bajo_icono = icono_y - alto_techo * 1.25 - tam_fuente * 0.9
    y_texto = min(y_primera_centrada, limite_bajo_icono)

    for linea in lineas:
        c.drawCentredString(cx_izq, y_texto, linea)
        y_texto -= interlineado

    # ---- detalle opcional (columna izquierda, abajo) ----
    if detalle:
        tam_detalle = max(6, ref * 0.045)
        while c.stringWidth(detalle, FUENTE_REGULAR, tam_detalle) > max_ancho_izq and tam_detalle > 6:
            tam_detalle -= 0.5
        c.setFillColor(COLOR_DETALLE)
        c.setFont(FUENTE_REGULAR, tam_detalle)
        c.drawCentredString(cx_izq, y0 + alto * 0.20, detalle)

    # ---- precio grande (columna derecha) ----
    texto_precio = precio
    tam_precio = ref * 0.32
    while c.stringWidth(texto_precio, FUENTE_BOLD, tam_precio) > max_ancho_der and tam_precio > ref * 0.08:
        tam_precio -= 1
    c.setFillColor(COLOR_PRECIO)
    c.setFont(FUENTE_BOLD, tam_precio)
    c.drawCentredString(cx_der, cy - tam_precio * 0.32, texto_precio)

    # ---- footer marca (centrado, abajo, ancho completo, una sola linea) ----
    y_linea_footer = y0 + alto * 0.155
    c.setStrokeColor(COLOR_ACENTO_2)
    c.setLineWidth(max(0.8, ref * 0.007))
    c.line(x0 + ancho * 0.30, y_linea_footer, x0 + ancho * 0.70, y_linea_footer)

    cx = x0 + ancho / 2
    tam_marca = ref * 0.06
    tam_sub = ref * 0.06 * 0.72
    y_footer = y0 + alto * 0.09
    _dibujar_footer_una_linea(c, cx, y_footer, tam_marca, tam_sub, max_ancho=ancho * 0.44)


def _partir_por_caracteres(c, texto, fuente, tam, max_ancho):
    """Ultimo recurso: si una sola palabra no entra en el ancho
    disponible ni al achicar la fuente, la corta caracter a caracter
    para que nunca se salga de la columna."""
    partes = []
    actual = ""
    for ch in texto:
        prueba = actual + ch
        if actual == "" or c.stringWidth(prueba, fuente, tam) <= max_ancho:
            actual = prueba
        else:
            partes.append(actual)
            actual = ch
    if actual:
        partes.append(actual)
    return partes




def _armar_lineas(c, palabras, fuente, tam_fuente, max_ancho):
    """Arma lineas de texto que no superen max_ancho, dado un listado de palabras."""
    lineas = []
    actual = ""
    for palabra in palabras:
        prueba = (actual + " " + palabra).strip()
        if c.stringWidth(prueba, fuente, tam_fuente) <= max_ancho:
            actual = prueba
        else:
            if actual:
                lineas.append(actual)
            actual = palabra
    if actual:
        lineas.append(actual)
    return lineas if lineas else [""]


def dibujar_cartel(c, x0, y0, ancho, alto, nombre_producto, precio, detalle):
    """Elige el layout (vertical u horizontal) segun la proporcion del cartel."""
    if ancho > alto:
        dibujar_cartel_horizontal(c, x0, y0, ancho, alto, nombre_producto, precio, detalle)
    else:
        dibujar_cartel_vertical(c, x0, y0, ancho, alto, nombre_producto, precio, detalle)


# ---------------------------------------------------------------
# Entrada de datos por consola
# ---------------------------------------------------------------
def pedir_tamano():
    print("=" * 60)
    print(" GENERADOR DE CARTELES DE PRECIO - REMODEL")
    print("=" * 60)
    print("Elegí el tamaño de cartel:")
    print()
    for clave, datos in TAMANOS.items():
        print(f"  {clave}) {datos['nombre']}")
    print()

    while True:
        opcion = input("Opción (1-4): ").strip()
        if opcion in TAMANOS:
            return TAMANOS[opcion]
        print("  Ingresá una opción válida (1, 2, 3 o 4).")


def pedir_productos():
    productos = []
    print()
    print("Cargá los productos uno por uno. Cuando termines, dejá el")
    print("nombre vacío y presioná ENTER para pasar a generar el PDF.")
    print()

    while True:
        nombre = input("Nombre del producto (ENTER para terminar): ").strip()
        if nombre == "":
            break

        precio_raw = input("Precio (ej: 15000 o $15.000): ").strip()
        precio = formatear_precio(precio_raw)

        tiene_detalle = input("¿Tiene detalle/condición? (s/n): ").strip().lower()
        detalle = ""
        if tiene_detalle.startswith("s"):
            detalle = input("Escribí el detalle: ").strip()

        cantidad = pedir_cantidad()

        productos.append({
            "nombre": nombre,
            "precio": precio,
            "detalle": detalle,
            "cantidad": cantidad,
        })
        print(f"  -> Agregado: {nombre} | {precio} | x{cantidad} carteles")
        print("-" * 60)

    return productos


def pedir_cantidad():
    while True:
        cantidad_raw = input("¿Cuántos carteles imprimir de este producto?: ").strip()
        if cantidad_raw.isdigit() and int(cantidad_raw) > 0:
            return int(cantidad_raw)
        print("  Ingresá un número entero mayor a 0.")


def formatear_precio(precio_raw):
    """Limpia lo que escribió el usuario, y devuelve el precio con
    separador de miles (punto) y el símbolo $. Si no se puede
    interpretar como número, lo deja tal cual (con $ agregado)."""
    precio_raw = precio_raw.strip()
    if precio_raw == "":
        return "$0"

    # nos quedamos solo con los dígitos (sacamos $, puntos, comas, espacios)
    solo_numeros = "".join(ch for ch in precio_raw if ch.isdigit())

    if solo_numeros == "":
        # no había ningún número (ej: "consultar", "a convenir") -> se deja como texto
        if not precio_raw.startswith("$"):
            return precio_raw
        return precio_raw

    numero = int(solo_numeros)
    # formateamos con separador de miles usando punto (formato argentino)
    con_separador = f"{numero:,}".replace(",", ".")
    return f"${con_separador}"


# ---------------------------------------------------------------
# Generacion del PDF
# ---------------------------------------------------------------
def generar_pdf(productos, tamano, ruta_salida):
    filas = tamano["filas"]
    columnas = tamano["columnas"]
    por_hoja = filas * columnas

    cartel_ancho = A4_ANCHO / columnas
    cartel_alto = A4_ALTO / filas

    # armamos la lista final repitiendo cada producto segun su cantidad
    lista_carteles = []
    for p in productos:
        lista_carteles.extend([p] * p["cantidad"])

    c = canvas.Canvas(ruta_salida, pagesize=A4)

    for i, cartel in enumerate(lista_carteles):
        pos_en_hoja = i % por_hoja
        if pos_en_hoja == 0 and i != 0:
            dibujar_lineas_corte(c, filas, columnas, cartel_ancho, cartel_alto)
            c.showPage()

        fila = pos_en_hoja // columnas
        col = pos_en_hoja % columnas
        x0 = col * cartel_ancho
        y0 = A4_ALTO - (fila + 1) * cartel_alto

        dibujar_cartel(c, x0, y0, cartel_ancho, cartel_alto,
                        cartel["nombre"], cartel["precio"], cartel["detalle"])

    dibujar_lineas_corte(c, filas, columnas, cartel_ancho, cartel_alto)
    c.showPage()
    c.save()


def dibujar_lineas_corte(c, filas, columnas, cartel_ancho, cartel_alto):
    if filas == 1 and columnas == 1:
        return  # no hace falta cortar nada
    c.setStrokeColor(HexColor("#cccccc"))
    c.setLineWidth(0.6)
    c.setDash(4, 4)
    for col in range(1, columnas):
        x = col * cartel_ancho
        c.line(x, 0, x, A4_ALTO)
    for fila in range(1, filas):
        y = A4_ALTO - fila * cartel_alto
        c.line(0, y, A4_ANCHO, y)
    c.setDash()


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------
def main():
    tamano = pedir_tamano()
    productos = pedir_productos()

    if not productos:
        print("No se cargó ningún producto. Cerrando.")
        input("Presiona ENTER para salir...")
        return

    por_hoja = tamano["filas"] * tamano["columnas"]
    total_carteles = sum(p["cantidad"] for p in productos)
    print()
    print(f"Tamaño elegido: {tamano['nombre']}")
    print(f"Total de carteles a generar: {total_carteles}")
    print(f"Total de hojas A4: {(total_carteles + por_hoja - 1) // por_hoja}")

    carpeta_script = os.path.dirname(os.path.abspath(__file__))
    fecha = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre_archivo = f"carteles_precio_{fecha}.pdf"
    ruta_salida = os.path.join(carpeta_script, nombre_archivo)

    generar_pdf(productos, tamano, ruta_salida)

    print()
    print("=" * 60)
    print(f"PDF generado con éxito:")
    print(f"  {ruta_salida}")
    print("=" * 60)
    input("Presiona ENTER para salir...")


if __name__ == "__main__":
    main()
