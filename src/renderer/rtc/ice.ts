import type { IceCandidatePayload } from '@shared/protocol'

/**
 * Converte um candidato ICE para a carga que vai pela sinalizacao.
 *
 * Nao usa `candidate.toJSON()` de proposito: o retorno dele e
 * `RTCIceCandidateInit`, cujo campo `candidate` e opcional no tipo. No objeto
 * `RTCIceCandidate` os campos sao todos obrigatorios, entao ler direto dele
 * dispensa checagens que nunca falhariam em tempo de execucao.
 */
export function toCandidatePayload(candidate: RTCIceCandidate): IceCandidatePayload {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment
  }
}
