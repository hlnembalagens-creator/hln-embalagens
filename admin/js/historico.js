// Compartilhado entre pedido.html e clientes.html.

var HISTORICO_FORMA_PAGAMENTO_LABELS = {
  boleto: 'Boleto', a_vista: 'À Vista', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', pix: 'Pix', link_pagamento: 'Link de Pagamento'
};

function formatBRLHistorico(n) {
  return 'R$ ' + (parseFloat(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Medidas são guardadas em metros/micras (fórmula da planilha), mas exibidas
// como número puro em cm, sem unidade, que é como o pessoal do dia a dia lê.
function formatMedidaCm(metros) {
  var cm = Number(((parseFloat(metros) || 0) * 100).toFixed(2));
  return cm.toLocaleString('pt-BR');
}

function formatarFormaPagamentoHistorico(pedido) {
  var texto = HISTORICO_FORMA_PAGAMENTO_LABELS[pedido.forma_pagamento] || '';
  if (pedido.forma_pagamento === 'boleto') {
    var detalhes = [];
    if (pedido.boleto_quantidade) detalhes.push(pedido.boleto_quantidade + 'x');
    if (pedido.boleto_dias) detalhes.push(pedido.boleto_dias + ' dias');
    if (detalhes.length) texto += ' (' + detalhes.join(', ') + ')';
  } else if (pedido.forma_pagamento === 'cartao_credito' && pedido.cartao_parcelas) {
    texto += ' (' + pedido.cartao_parcelas + 'x)';
  }
  return texto;
}

/* ===================== FINANCEIRO AUTOMÁTICO ===================== */
// Toda vez que um pedido (não orçamento) é salvo, refaz as entradas do financeiro
// ligadas a ele — assim elas sempre refletem o valor/forma de pagamento atuais.
// currentUserId vem do escopo global da página (declarado em pedido.js/clientes.js).

function addDiasFinanceiro(data, dias) {
  var d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function sincronizarFinanceiroDoPedido(pedido, clienteNome, ehFornecedor) {
  if (!pedido || pedido.tipo !== 'pedido') return;

  // Limpa dos dois lados — se o cadastro virou/deixou de ser fornecedor entre
  // uma edição e outra, o pedido pode ter migrado de entrada pra saída (ou vice-versa).
  await supabaseClient.from('financeiro_entradas').delete().eq('pedido_id', pedido.id);
  await supabaseClient.from('financeiro_saidas').delete().eq('pedido_id', pedido.id);

  var hoje = new Date();
  var valorBase = (pedido.forma_pagamento === 'a_vista' || pedido.forma_pagamento === 'pix') && pedido.valor_total_a_pagar_vista
    ? pedido.valor_total_a_pagar_vista
    : pedido.valor_total_a_pagar;
  valorBase = parseFloat(valorBase) || 0;

  var produtoLabel = 'Pedido nº ' + pedido.numero;
  var parcelas = []; // { data, valor, rotulo }

  if (pedido.forma_pagamento === 'boleto') {
    var qtd = parseInt(pedido.boleto_quantidade, 10) || 1;
    var dias = parseInt(pedido.boleto_dias, 10) || 30;
    var valorParcela = valorBase / qtd;
    for (var i = 0; i < qtd; i++) {
      parcelas.push({ data: addDiasFinanceiro(hoje, dias * (i + 1)), valor: valorParcela, rotulo: produtoLabel + ' — boleto ' + (i + 1) + '/' + qtd });
    }
  } else if (pedido.forma_pagamento === 'cartao_credito') {
    var numParcelas = parseInt(pedido.cartao_parcelas, 10) || 1;
    var valorParcelaCartao = valorBase / numParcelas;
    for (var j = 0; j < numParcelas; j++) {
      parcelas.push({ data: addDiasFinanceiro(hoje, 30 * j), valor: valorParcelaCartao, rotulo: produtoLabel + ' — parcela ' + (j + 1) + '/' + numParcelas });
    }
  } else {
    parcelas.push({ data: hoje.toISOString().slice(0, 10), valor: valorBase, rotulo: produtoLabel });
  }

  var pagoAtual = !!pedido.pago;
  var dataPagamentoAtual = pedido.pago ? (pedido.data_pagamento || hoje.toISOString().slice(0, 10)) : null;

  if (ehFornecedor) {
    var saidas = parcelas.map(function (p) {
      return {
        data: p.data,
        descricao: (clienteNome ? clienteNome + ' — ' : '') + p.rotulo,
        categoria: 'Fornecedor',
        valor: p.valor,
        observacao: 'Gerado automaticamente a partir do pedido (compra de fornecedor).',
        pedido_id: pedido.id,
        created_by: currentUserId
      };
    });
    if (saidas.length) await supabaseClient.from('financeiro_saidas').insert(saidas);
  } else {
    var entradas = parcelas.map(function (p) {
      return {
        data: p.data,
        cliente_nome: clienteNome || null,
        produto: p.rotulo,
        valor: p.valor,
        observacao: 'Gerado automaticamente a partir do pedido.',
        pedido_id: pedido.id,
        pago: pagoAtual,
        data_pagamento: dataPagamentoAtual,
        created_by: currentUserId
      };
    });
    if (entradas.length) await supabaseClient.from('financeiro_entradas').insert(entradas);
  }
}

// Apaga de vez um pedido/orçamento de teste — junto com os itens e qualquer
// lançamento que ele tenha gerado no Financeiro, pra não sujar as métricas.
async function excluirPedido(pedidoId) {
  await supabaseClient.from('financeiro_entradas').delete().eq('pedido_id', pedidoId);
  await supabaseClient.from('financeiro_saidas').delete().eq('pedido_id', pedidoId);
  await supabaseClient.from('pedido_itens_vacuo').delete().eq('pedido_id', pedidoId);
  await supabaseClient.from('pedido_itens_gerais').delete().eq('pedido_id', pedidoId);
  var { error } = await supabaseClient.from('pedidos').delete().eq('id', pedidoId);
  if (error) return { error: error };
  return { ok: true };
}
window.excluirPedido = excluirPedido;

// Marca (ou desmarca) um pedido como pago — atualiza o pedido e reflete direto
// nas entradas do Financeiro já geradas pra ele, sem precisar refazer tudo.
async function marcarPedidoPago(pedidoId, pago) {
  var dataPagamento = pago ? new Date().toISOString().slice(0, 10) : null;
  var { error } = await supabaseClient.from('pedidos').update({ pago: pago, data_pagamento: dataPagamento }).eq('id', pedidoId);
  if (error) return { error: error };
  await supabaseClient.from('financeiro_entradas').update({ pago: pago, data_pagamento: dataPagamento }).eq('pedido_id', pedidoId);
  return { ok: true, dataPagamento: dataPagamento };
}
window.marcarPedidoPago = marcarPedidoPago;

async function contarOrcamentosPendentes(clienteId) {
  var { count, error } = await supabaseClient
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .eq('tipo', 'orcamento')
    .eq('status_orcamento', 'pendente');
  if (error) return 0;
  return count || 0;
}

async function loadHistoricoCliente(clienteId, containerId, onAtualizado) {
  var conteudo = document.getElementById(containerId || 'historico-conteudo');
  conteudo.textContent = 'Carregando...';

  var { data, error } = await supabaseClient
    .from('pedidos')
    .select('*, clientes(razao_social, nome_fantasia, eh_fornecedor), pedido_itens_vacuo(*), pedido_itens_gerais(*)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) {
    conteudo.textContent = 'Erro ao carregar histórico: ' + error.message;
    return;
  }

  if (!data || !data.length) {
    conteudo.innerHTML = '<p style="color:var(--gray-400);">Nenhum pedido ou orçamento anterior encontrado para esse cliente.</p>';
    return;
  }

  conteudo.innerHTML = data.map(function (pedido) {
    var dataStr = new Date(pedido.created_at).toLocaleDateString('pt-BR');
    var itensVacuo = (pedido.pedido_itens_vacuo || []).map(function (i) {
      return '<li>' + (i.material || 'SACO A VÁCUO') + ' — ' + formatMedidaCm(i.largura_m) + 'x' + formatMedidaCm(i.comprimento_m) + 'x' + i.espessura_micras + ' — Qtd: ' + i.quantidade + '</li>';
    }).join('');
    var itensGerais = (pedido.pedido_itens_gerais || []).map(function (i) {
      return '<li>' + i.nome_produto + ' — Qtd: ' + i.quantidade + '</li>';
    }).join('');

    var tipoLabel, badgeClass, badgeText, acoesEspecificas = '';
    if (pedido.tipo === 'orcamento') {
      tipoLabel = 'Orçamento nº ' + pedido.numero;
      if (pedido.status_orcamento === 'convertido') {
        badgeClass = 'badge-ok'; badgeText = 'Convertido em pedido';
      } else if (pedido.status_orcamento === 'nao_convertido') {
        badgeClass = 'badge-warning'; badgeText = 'Não convertido';
      } else {
        badgeClass = 'badge-warning'; badgeText = 'Pendente';
        acoesEspecificas =
          '<button type="button" class="btn btn-outline" style="padding:6px 12px; font-size:0.78rem;" data-converter="' + pedido.id + '">Converter em pedido</button>' +
          '<button type="button" class="btn btn-outline" style="padding:6px 12px; font-size:0.78rem; color:#a92323; border-color:#a92323;" data-nao-converter="' + pedido.id + '">Marcar como não convertido</button>';
      }
    } else {
      tipoLabel = 'Pedido nº ' + pedido.numero;
      badgeClass = 'badge-ok'; badgeText = 'Pedido';
      acoesEspecificas = pedido.pago
        ? '<button type="button" class="btn btn-outline" style="padding:6px 12px; font-size:0.78rem;" data-marcar-pendente="' + pedido.id + '">Marcar como pendente</button>'
        : '<button type="button" class="btn btn-primary" style="padding:6px 12px; font-size:0.78rem;" data-marcar-pago="' + pedido.id + '">Pago</button>';
    }

    var pagoBadge = '';
    if (pedido.tipo === 'pedido') {
      pagoBadge = pedido.pago
        ? '<span class="badge badge-ok">Pago' + (pedido.data_pagamento ? ' em ' + new Date(pedido.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '') + '</span>'
        : '<span class="badge badge-warning">Pendente de pagamento</span>';
    }

    var botaoExcluir = currentUserRole !== 'admin1'
      ? '<button type="button" class="btn btn-outline" style="padding:6px 12px; font-size:0.78rem; color:#a92323; border-color:#a92323;" data-excluir="' + pedido.id + '">Excluir</button>'
      : '';

    var acoes = '<div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-outline" style="padding:6px 12px; font-size:0.78rem;" data-editar="' + pedido.id + '">Editar</button>' +
      acoesEspecificas +
      botaoExcluir +
    '</div>';

    return '<div style="border-bottom:1px solid var(--off-white); padding:14px 0;">' +
      '<strong>' + tipoLabel + '</strong> <span class="badge ' + badgeClass + '">' + badgeText + '</span> ' + pagoBadge + ' — ' + dataStr +
      ' &nbsp; <span style="color:var(--gray-400);">' + formatarFormaPagamentoHistorico(pedido) + '</span>' +
      '<ul style="margin:8px 0 8px 20px; font-size:0.88rem;">' + itensVacuo + itensGerais + '</ul>' +
      '<strong>Valor total a pagar: ' + formatBRLHistorico(pedido.valor_total_a_pagar) + '</strong>' +
      acoes +
    '</div>';
  }).join('');

  conteudo.querySelectorAll('[data-editar]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.dataset.editar;
      if (typeof window.iniciarEdicaoPedido === 'function') {
        window.iniciarEdicaoPedido(id);
        var modal = document.getElementById('modal-historico');
        if (modal) modal.classList.remove('open');
      } else {
        location.href = 'pedido.html?editar=' + id;
      }
    });
  });

  conteudo.querySelectorAll('[data-excluir]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var id = btn.dataset.excluir;
      var item = data.find(function (p) { return p.id === id; });
      var label = item ? ((item.tipo === 'orcamento' ? 'Orçamento nº ' : 'Pedido nº ') + item.numero) : 'este registro';
      if (!confirm('Excluir ' + label + '? Isso apaga também os lançamentos dele no Financeiro. Essa ação não pode ser desfeita.')) return;

      btn.disabled = true;
      btn.textContent = 'Excluindo...';
      var result = await excluirPedido(id);
      if (result.error) {
        alert('Erro ao excluir: ' + result.error.message);
        btn.disabled = false;
        btn.textContent = 'Excluir';
        return;
      }

      loadHistoricoCliente(clienteId, containerId, onAtualizado);
      if (typeof onAtualizado === 'function') onAtualizado();
    });
  });

  conteudo.querySelectorAll('[data-converter]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Converter este orçamento em pedido? Ele passa a contar como pedido real.')) return;
      var { error } = await supabaseClient.from('pedidos')
        .update({ tipo: 'pedido', status_orcamento: 'convertido' })
        .eq('id', btn.dataset.converter);
      if (error) { alert('Erro ao converter: ' + error.message); return; }

      var pedidoOriginal = data.find(function (p) { return p.id === btn.dataset.converter; });
      if (pedidoOriginal) {
        var pedidoConvertido = Object.assign({}, pedidoOriginal, { tipo: 'pedido', status_orcamento: 'convertido' });
        var clienteInfo = pedidoOriginal.clientes;
        var nomeCliente = clienteInfo ? clienteInfo.razao_social + (clienteInfo.nome_fantasia ? ' (' + clienteInfo.nome_fantasia + ')' : '') : null;
        await sincronizarFinanceiroDoPedido(pedidoConvertido, nomeCliente, !!(clienteInfo && clienteInfo.eh_fornecedor));
      }

      loadHistoricoCliente(clienteId, containerId, onAtualizado);
      if (typeof onAtualizado === 'function') onAtualizado();
    });
  });

  conteudo.querySelectorAll('[data-marcar-pago]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var result = await marcarPedidoPago(btn.dataset.marcarPago, true);
      if (result.error) { alert('Erro ao marcar como pago: ' + result.error.message); return; }
      loadHistoricoCliente(clienteId, containerId, onAtualizado);
      if (typeof onAtualizado === 'function') onAtualizado();
    });
  });

  conteudo.querySelectorAll('[data-marcar-pendente]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Marcar este pedido como pendente de pagamento de novo?')) return;
      var result = await marcarPedidoPago(btn.dataset.marcarPendente, false);
      if (result.error) { alert('Erro: ' + result.error.message); return; }
      loadHistoricoCliente(clienteId, containerId, onAtualizado);
      if (typeof onAtualizado === 'function') onAtualizado();
    });
  });

  conteudo.querySelectorAll('[data-nao-converter]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('Marcar este orçamento como não convertido? Continua no histórico, mas não vira pedido.')) return;
      var { error } = await supabaseClient.from('pedidos')
        .update({ status_orcamento: 'nao_convertido' })
        .eq('id', btn.dataset.naoConverter);
      if (error) { alert('Erro ao marcar: ' + error.message); return; }
      loadHistoricoCliente(clienteId, containerId, onAtualizado);
      if (typeof onAtualizado === 'function') onAtualizado();
    });
  });
}
