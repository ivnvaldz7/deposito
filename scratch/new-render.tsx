  return (
    <div className={cn('space-y-5', barraArmadorVisible && 'pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:pb-0')}>
      <section className="rounded-xl border border-white/10 bg-surface-container-high overflow-hidden">
        {/* Header y Acciones */}
        <div className="p-4 lg:p-6 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <h1 data-testid="pedido-numero" className="font-heading text-[22px] font-bold tracking-[-0.02em] text-on-surface">
                Pedido {pedido.numero}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant={meta.variant} className="justify-center">
                  {meta.label}
                </Badge>
                {clientePendiente && <Badge variant="warning">Cliente pendiente de validación</Badge>}
              </div>
              <p className="mt-2 font-body text-[12px] text-on-surface-variant">Creado el {formatFechaHora(pedido.createdAt)}</p>
              <div className="mt-0.5 font-body text-[11px] text-outline">
                {pedido.vendedorNombre && <p>Vendedor: {pedido.vendedorNombre}</p>}
                {pedido.armadorNombre && <p>Armador: {pedido.armadorNombre}</p>}
              </div>
              {clientePendiente && (
                <p className="mt-1 font-body text-[11px] font-medium text-warning">Facturación debe completar los datos</p>
              )}

              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Cliente</h2>
                  {canEditar && (
                    <button
                      type="button"
                      onClick={() => setSheetCliente(true)}
                      className="font-body text-[12px] font-semibold text-primary transition hover:underline"
                    >
                      Cambiar
                    </button>
                  )}
                </div>
                <p className="mt-1 font-heading text-[15px] font-semibold text-on-surface">{clienteActualNombre}</p>
                {clienteCambio && (
                  <p className="mt-1 font-body text-[11px] font-medium text-warning">Cambio de cliente sin guardar</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-[12px]">
                  {clienteActual?.contacto && <div className="flex gap-1.5"><dt className="text-outline">Contacto:</dt><dd className="text-on-surface-variant">{clienteActual.contacto}</dd></div>}
                  {clienteActual?.cuit && <div className="flex gap-1.5"><dt className="text-outline">CUIT:</dt><dd className="text-on-surface-variant">{clienteActual.cuit}</dd></div>}
                  {clienteActual?.direccion && (
                    <div className="flex gap-1.5">
                      <dt className="text-outline">Dirección:</dt>
                      <dd className="text-on-surface-variant">{clienteActual.direccion}{clienteActual?.localidad ? `, ${clienteActual.localidad}` : ''}</dd>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 lg:w-48">
              {canAprobar(pedido, rol, userId) && (
                <>
                  <Button onClick={() => setConfirm('aprobar')} disabled={clientePendiente} className="min-h-10 w-full">Aprobar</Button>
                  {clientePendiente && <p className="font-body text-[11px] font-medium text-warning text-center">Validar para aprobar</p>}
                </>
              )}
              {canTomar(pedido, rol, userId) && (
                <div data-testid="accion-tomar-desktop">
                  <Button variant="outline" onClick={() => setConfirm('tomar')} className="min-h-10 w-full">Tomar</Button>
                </div>
              )}
              {canCancelarDirecto(pedido, rol, userId) && (
                <Button variant="outline" onClick={() => setConfirm('cancelar')} className="min-h-10 w-full">Cancelar</Button>
              )}
              {canSolicitarCancelacion(pedido, rol, userId) && (
                <Button variant="outline" onClick={abrirSolicitarCancelacion} className="min-h-10 w-full">Solicitar cancelación</Button>
              )}
              {pedido.estado === 'PREPARADO' && !remitoVigente && (
                <p className="rounded-lg border border-primary-container/30 bg-primary-container/10 p-2 font-body text-[11px] font-medium text-primary-container text-center">
                  Esperando remito
                </p>
              )}
              {canDespachar(pedido, rol, userId) && (
                <div data-testid="accion-despachar-desktop">
                  <button type="button" onClick={() => setConfirm('despachar')} disabled={despacharMutation.isPending} className="min-h-10 w-full rounded-full border border-error/40 font-body text-[13px] font-semibold text-error transition hover:bg-error/10 disabled:opacity-50">Confirmar despacho</button>
                </div>
              )}
              {pedido.estado === 'DESPACHADO' && (
                <div className="text-center lg:text-right">
                  <p className="font-heading text-[13px] font-bold text-success">Despachado</p>
                  {pedido.despachadoAt && <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">{formatFechaHora(pedido.despachadoAt)}</p>}
                </div>
              )}
              {pedido.estado === 'CANCELADO' && (
                <div className="text-center lg:text-right">
                  <p className="font-heading text-[13px] font-bold text-error">Cancelado</p>
                  {pedido.motivoCancelacion && <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">{pedido.motivoCancelacion}</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        {pedido.cancelacionSolicitadaAt && pedido.estado === 'EN_ARMADO' && (
          <div role="status" data-testid="banner-cancelacion" className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 p-4 lg:px-6">
            <div className="min-w-0">
              <p className="font-heading text-[13px] font-bold text-warning">Cancelación solicitada</p>
              {pedido.motivoCancelacion && <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">Motivo: {pedido.motivoCancelacion}</p>}
            </div>
            {canConfirmarCancelacion(pedido, rol, userId) ? (
              <div className="hidden lg:block" data-testid="accion-cancelacion-desktop">
                <button type="button" onClick={abrirConfirmarCancelacion} className="rounded-full border border-warning/50 px-4 py-2 font-body text-[12px] font-semibold text-warning transition hover:bg-warning/20">Confirmar cancelación</button>
              </div>
            ) : (
              <p className="font-body text-[11px] text-on-surface-variant">Esperando confirmación del armador</p>
            )}
          </div>
        )}

        <div className="p-4 lg:p-6 space-y-6">
          {puedeProgreso && (
            <div aria-label="Progreso de armado" className="hidden lg:block rounded-xl border border-white/10 bg-surface-container p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Armado</h2>
                  <p className="mt-1 font-body text-[12px] font-semibold text-on-surface">{itemsCompletados} de {pedido.items.length} items preparados</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-highest">
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pedido.items.length === 0 ? 0 : (itemsCompletados / pedido.items.length) * 100}%` }} />
                  </div>
                </div>
                <div className="shrink-0 w-48 text-center">
                  <Button onClick={() => setConfirm('preparar')} disabled={!prepararListo} loading={prepararMutation.isPending} className="min-h-10 w-full">Preparar</Button>
                  {itemsPendientes > 0 && <p className="mt-2 text-center font-body text-[11px] font-medium text-warning">Faltan {itemsPendientes}</p>}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Productos</h2>
              {canEditar && (
                <button type="button" onClick={() => setSheetProductos(true)} className="rounded-full border border-primary/40 px-3.5 py-1.5 font-body text-[12px] font-semibold text-primary transition hover:bg-primary/10">+ Agregar producto</button>
              )}
            </div>
            {pedido.estado === 'APROBADO' && canEditar && (
              <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 font-body text-[11px] font-medium text-warning">
                Editar puede cambiar la disponibilidad y liberar la reserva actual
              </p>
            )}
            <div className="mt-3 space-y-3">
              {lineas.map(({ item, cajas, sueltos, unidades, producto }) => (
                <LineaDetalle
                  key={item.productoId}
                  productoId={item.productoId}
                  nombre={item.producto.nombre}
                  sku={item.producto.sku}
                  cajas={cajas}
                  sueltos={sueltos}
                  unidades={unidades}
                  unidadesPorCaja={item.producto.unidadesPorCaja}
                  disponible={producto?.disponible}
                  reservado={producto?.reservado}
                  completado={item.completado}
                  editable={canEditar}
                  completable={puedeProgreso}
                  onChange={(nCajas, nSueltos) => cambiarCantidad(item.productoId, nCajas, nSueltos)}
                  onEliminar={canEditar ? () => eliminarLinea(item.productoId) : undefined}
                  onToggleCompletar={puedeProgreso ? () => void toggleCompletar(item.id) : undefined}
                />
              ))}
            </div>
            {canEditar && (
              <div className="mt-5 flex flex-col lg:flex-row lg:items-center lg:justify-end gap-3 border-t border-white/10 pt-5">
                {pedido.estado === 'APROBADO' && (
                  <p className="text-center lg:text-right font-body text-[11px] text-on-surface-variant flex-1">
                    Al guardar se liberará la reserva actual y se volverá a reservar
                  </p>
                )}
                <Button onClick={handleGuardar} loading={guardando} disabled={!hayCambios} className="min-h-11 lg:min-h-10 w-full lg:w-auto px-6">Guardar cambios</Button>
              </div>
            )}
          </div>
        </div>

        {puedeVerPanelRemito && (
          <div className="border-t border-white/10 bg-surface-container/50 p-4 lg:p-6">
            {remitoVigente ? (
              <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
                <div className="flex-1">
                  <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Remito Vigente</h2>
                  <div className="mt-2 rounded-xl border border-success/30 bg-success/10 p-3">
                    <p className="font-heading text-[14px] font-semibold text-on-surface">Remito {remitoVigente.numero}</p>
                    <p className="mt-0.5 font-body text-[12px] text-on-surface-variant">Fecha: {formatFecha(remitoVigente.fecha)}</p>
                    <p className="font-body text-[12px] text-on-surface-variant">Transporte: {remitoVigente.transporteNombre}{remitoVigente.transporteDireccion ? ` · ${remitoVigente.transporteDireccion}` : ''}</p>
                  </div>
                </div>
                <div className="mt-3 lg:mt-0 shrink-0 flex flex-col gap-2 lg:w-48">
                  <Button variant="outline" onClick={() => void descargarRemito()} className="min-h-10 w-full">Descargar PDF</Button>
                  <Button variant="outline" onClick={abrirAnular} className="min-h-10 w-full">Anular</Button>
                </div>
              </div>
            ) : canEmitirRemito(pedido, rol) ? (
              <div>
                <h2 className="font-heading text-[12px] font-bold uppercase tracking-[0.8px] text-outline">Emitir remito</h2>
                <div className="mt-3 flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 space-y-2.5">
                    <select
                      aria-label="Seleccionar transporte"
                      value={usarOcasional ? '__ocasional__' : transporteId}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '__ocasional__') { setUsarOcasional(true); setTransporteId('') } 
                        else { setUsarOcasional(false); setTransporteId(value) }
                      }}
                      className="input-field text-base"
                    >
                      <option value="">Seleccionar transporte</option>
                      {transportistas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      <option value="__ocasional__">OTRO / TRANSPORTE OCASIONAL</option>
                    </select>
                    {usarOcasional && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        <input ref={ocasionalNombreRef} value={ocasionalNombre} onChange={(e) => setOcasionalNombre(e.target.value)} placeholder="Nombre del transporte" className="input-field text-base" />
                        <input ref={ocasionalDireccionRef} value={ocasionalDireccion} onChange={(e) => setOcasionalDireccion(e.target.value)} placeholder="Dirección" className="input-field text-base" />
                      </div>
                    )}
                    {remitoError && <p role="alert" className="font-body text-[12px] font-medium text-error">{remitoError}</p>}
                  </div>
                  <div className="shrink-0 lg:w-48 lg:pt-0">
                    <Button onClick={() => void emitirRemito()} loading={emitirRemitoMutation.isPending} className="min-h-11 lg:min-h-10 w-full">Emitir remito</Button>
                  </div>
                </div>
              </div>
            ) : null}
            {remitosInvalidados.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                <h3 className="font-heading text-[11px] font-bold uppercase tracking-[0.8px] text-outline">Remitos anteriores</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {remitosInvalidados.map((r) => (
                    <div key={r.id} className="rounded-lg border border-white/10 bg-surface-container p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-body text-[12px] font-semibold text-on-surface">Remito {r.numero}</p>
                        <Badge variant="error">Anulado</Badge>
                      </div>
                      <p className="mt-0.5 font-body text-[11px] text-outline">{formatFecha(r.fecha)}</p>
                      {r.motivoInvalidacion && <p className="mt-0.5 font-body text-[11px] text-on-surface-variant">Motivo: {r.motivoInvalidacion}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
