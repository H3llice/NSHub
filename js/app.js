import { inicializarOCs } from './modules/ocs.js'


let favoritos = JSON.parse(localStorage.getItem('favoritos')) || [];
let certificados = JSON.parse(localStorage.getItem('certificados')) || [];
let formularioAtualCarregado = null;

// ===== CONTROLE DA SIDEBAR (MOBILE) =====
window.toggleSidebar = function () {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('show');
    sidebar.classList.toggle('hidden');
    overlay.classList.toggle('show');
}

window.closeSidebar = function () {
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.remove('show');
        sidebar.classList.add('hidden');
        overlay.classList.remove('show');
    }
}

window.abrirPagina = function (event, id) {
    console.log('abrirPagina chamado com id:', id)

    event.preventDefault()

    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active")
    })

    document.getElementById(id).classList.add("active")

    closeSidebar();

    if (id === 'certificados') {
        voltarParaListaCertificados(event);
    }

    if (id === 'ocs') {
        inicializarOCs();
    }
}

// Resetar sidebar quando redimensionar
window.addEventListener('resize', () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (window.innerWidth > 768) {
        sidebar.classList.remove('show');
        sidebar.classList.remove('hidden');
        overlay.classList.remove('show');
        sidebar.style.transform = '';
    }
});

window.toggleMenu = function (event, id) {
    event.preventDefault()

    document.querySelectorAll(".submenu").forEach(menu => {
        if (menu.id !== id) menu.style.display = "none"
    })

    let menu = document.getElementById(id)
    menu.style.display = menu.style.display === "block" ? "none" : "block"
}

window.toggleFavorito = function (event, id, nome) {
    event.preventDefault();
    event.stopPropagation();

    const btn = event.target;
    const index = favoritos.findIndex(f => f.id === id);

    if (index > -1) {
        favoritos.splice(index, 1);
        btn.classList.remove("favorited");
        btn.textContent = "☆";
    } else {
        favoritos.push({ id: id, nome: nome });
        btn.classList.add("favorited");
        btn.textContent = "★";
    }

    localStorage.setItem('favoritos', JSON.stringify(favoritos));
    atualizarFavoritos();
}

function atualizarFavoritos() {
    const lista = document.getElementById('favoritos-list');

    if (favoritos.length === 0) {
        lista.innerHTML = '<li style="text-align: center; color: #999; padding: 20px;">Nenhum favorito adicionado ainda</li>';
    } else {
        lista.innerHTML = favoritos.map(fav => `
            <li>
                <a href="#" onclick="abrirPagina(event, '${fav.id}')" style="color: var(--verde); text-decoration: none; flex: 1;">
                    ${fav.nome}
                </a>
                <button class="remove-favorito" onclick="removerFavorito(event, '${fav.id}')">✕</button>
            </li>
        `).join('');
    }
}

window.removerFavorito = function (event, id) {
    event.preventDefault();
    event.stopPropagation();

    favoritos = favoritos.filter(f => f.id !== id);
    localStorage.setItem('favoritos', JSON.stringify(favoritos));

    const btn = document.querySelector(`button[onclick*="toggleFavorito(event, '${id}'"]`);
    if (btn) {
        btn.classList.remove("favorited");
        btn.textContent = "☆";
    }

    atualizarFavoritos();
}

window.addEventListener('load', () => {
    favoritos.forEach(fav => {
        const btn = document.querySelector(`button[onclick*="toggleFavorito(event, '${fav.id}'"]`);
        if (btn) {
            btn.classList.add("favorited");
            btn.textContent = "★";
        }
    });
    atualizarFavoritos();
    atualizarTabelaCertificados();
    
});

window.toggleNovoRegistroMenu = function (event) {
    event.preventDefault();
    const dropdown = document.getElementById('novo-registro-dropdown');
    dropdown.classList.toggle('show');
}

document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('novo-registro-dropdown');
    const menu = document.querySelector('.novo-registro-menu');
    if (!menu.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

// ===== FUNÇÕES DE CERTIFICADOS =====

window.toggleTipoCertificadoMenu = function (event) {
    event.preventDefault();
    event.stopPropagation();
    const dropdown = document.getElementById('tipo-certificado-dropdown');
    dropdown.classList.toggle('show');
}

document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('tipo-certificado-dropdown');
    const btn = document.querySelector('.btn-type-selector');
    if (btn && !btn.contains(event.target)) {
        dropdown.classList.remove('show');
    }
}, true);

// Carregar formulário dinamicamente via AJAX
window.carregarFormulario = function (event, tipo) {
    event.preventDefault();

    // Esconder lista
    document.getElementById('certificado-lista-container').style.display = 'none';
    document.getElementById('tipo-certificado-dropdown').classList.remove('show');

    // Carregar formulário
    const container = document.getElementById('formulario-container');

    fetch(`../html/certificados/${tipo}.html`)
        .then(response => {
            if (!response.ok) throw new Error('Arquivo não encontrado');
            return response.text();
        })
        .then(html => {
            container.innerHTML = html;
            container.classList.add('show');
            document.querySelector('.content').style.maxHeight = 'none';
            formularioAtualCarregado = tipo;

            // Se for balsa, preencher data
            if (tipo === 'balsa') {
                const dataEmissao = document.getElementById('data-emissao');
                if (dataEmissao) {
                    setarDataEmissaoHoje();
                }
            }
        })
        .catch(error => {
            console.error('Erro ao carregar formulário:', error);
            container.innerHTML = '<p style="color: red; padding: 20px;">Erro ao carregar formulário</p>';
        });
}

window.voltarParaListaCertificados = function (event) {
    if (event) event.preventDefault();

    document.getElementById('certificado-lista-container').style.display = 'block';
    document.getElementById('formulario-container').innerHTML = '';
    document.getElementById('formulario-container').classList.remove('show');
    document.querySelector('.content').style.maxHeight = 'calc(100vh - 65px)';
    formularioAtualCarregado = null;
}

function setarDataEmissaoHoje() {
    const hoje = new Date().toISOString().split('T')[0];
    const campo = document.getElementById('data-emissao');
    if (campo) {
        campo.value = hoje;
    }
}

window.salvarCertificado = function (event, tipo) {
    event.preventDefault();

    const formId = `form-certificado-${tipo}`;
    const form = document.getElementById(formId);

    if (!form) {
        alert('Formulário não encontrado');
        return;
    }

    const formData = new FormData(form);

    const novoCertificado = {
        id: Date.now(),
        tipo: tipo,
        numero: document.getElementById('numero')?.value || '',
        navio: document.getElementById('navio')?.value || '',
        armador: document.getElementById('armador')?.value || '',
        email: document.getElementById('email')?.value || '',
        modelo: document.getElementById('modelo')?.value || '',
        fabricante: document.getElementById('fabricante')?.value || '',
        portoRegistro: document.getElementById('porto-registro')?.value || '',
        telefone: document.getElementById('telefone')?.value || '',
        numeroSerie: document.getElementById('numero-serie')?.value || '',
        capacidade: document.getElementById('capacidade')?.value || '',
        classe: document.getElementById('classe')?.value || '',
        dataFabricacao: document.getElementById('data-fabricacao')?.value || '',
        dataEmissao: document.getElementById('data-emissao')?.value || '',
        formData: Object.fromEntries(formData)
    };

    certificados.push(novoCertificado);
    localStorage.setItem('certificados', JSON.stringify(certificados));

    voltarParaListaCertificados();
    atualizarTabelaCertificados();

    alert('Certificado salvo com sucesso!');
}

function atualizarTabelaCertificados() {
    const tabela = document.getElementById('tabela-certificados');

    if (certificados.length === 0) {
        tabela.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 30px;">Nenhum certificado cadastrado ainda</td></tr>';
        return;
    }

    tabela.innerHTML = certificados.map(cert => {
        const dataEmissao = new Date(cert.dataEmissao).toLocaleDateString('pt-BR');
        return `
            <tr>
                <td>${cert.numero}</td>
                <td>${cert.navio}</td>
                <td>${cert.tipo.charAt(0).toUpperCase() + cert.tipo.slice(1)}</td>
                <td>${dataEmissao}</td>
                <td>
                    <button class="btn btn-sm btn-info" style="margin-right: 5px;" onclick="editarCertificado(${cert.id})">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deletarCertificado(${cert.id})">Deletar</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.editarCertificado = function (id) {
    alert('Função de edição em desenvolvimento');
}

window.deletarCertificado = function (id) {
    if (confirm('Tem certeza que deseja deletar este certificado?')) {
        certificados = certificados.filter(c => c.id !== id);
        localStorage.setItem('certificados', JSON.stringify(certificados));
        atualizarTabelaCertificados();
    }
}